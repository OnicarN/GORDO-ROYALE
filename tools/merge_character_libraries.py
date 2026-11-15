#!/usr/bin/env python3
"""Merge Quaternius CC0 animation GLBs onto the matching humanoid GLTF rig."""
from __future__ import annotations
import copy, json, pathlib, struct, sys

def load_glb(path: pathlib.Path):
    raw = path.read_bytes()
    if raw[:4] != b"glTF": raise ValueError(f"Not a GLB: {path}")
    version, total = struct.unpack_from("<II", raw, 4)
    if version != 2 or total != len(raw): raise ValueError(f"Invalid GLB header: {path}")
    offset = 12
    chunks = []
    while offset < total:
        length, kind = struct.unpack_from("<II", raw, offset)
        offset += 8
        chunks.append((kind, raw[offset:offset+length]))
        offset += length
    doc = json.loads(next(data for kind, data in chunks if kind == 0x4E4F534A))
    binary = next((data for kind, data in chunks if kind == 0x004E4942), b"")
    return doc, binary

def save_glb(path: pathlib.Path, doc, binary):
    doc["buffers"] = [{"byteLength": len(binary)}]
    json_chunk = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_chunk += b" " * ((4 - len(json_chunk) % 4) % 4)
    binary += b"\0" * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(json_chunk) + 8 + len(binary)
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<II", len(json_chunk), 0x4E4F534A) + json_chunk + struct.pack("<II", len(binary), 0x004E4942) + binary)

def load_gltf(path: pathlib.Path):
    doc = json.loads(path.read_text(encoding="utf-8"))
    if len(doc.get("buffers", [])) != 1: raise ValueError("Expected one source buffer")
    buffer_path = (path.parent / doc["buffers"][0]["uri"]).resolve()
    return doc, buffer_path.read_bytes()

def rig_names(doc):
    joints = doc["skins"][0]["joints"]
    return [doc["nodes"][index]["name"] for index in joints]

def merge_animation_library(target, target_binary, source_path, label, known_names):
    source, source_binary = load_glb(source_path)
    if rig_names(target) != rig_names(source):
        raise ValueError(f"Rig mismatch for {source_path.name}")
    target_node_by_name = {node.get("name"): index for index, node in enumerate(target["nodes"]) if node.get("name")}
    source_offset = len(target_binary)
    target_binary += b"\0" * ((4 - source_offset % 4) % 4)
    source_offset = len(target_binary)
    accessor_map, view_map = {}, {}
    def copy_view(source_index):
        if source_index in view_map: return view_map[source_index]
        item = copy.deepcopy(source["bufferViews"][source_index])
        if item.get("buffer", 0) != 0: raise ValueError("Unexpected non-zero buffer index")
        item["buffer"] = 0
        item["byteOffset"] = source_offset + item.get("byteOffset", 0)
        new_index = len(target.setdefault("bufferViews", []))
        target["bufferViews"].append(item)
        view_map[source_index] = new_index
        return new_index
    def copy_accessor(source_index):
        if source_index in accessor_map: return accessor_map[source_index]
        item = copy.deepcopy(source["accessors"][source_index])
        if "bufferView" in item: item["bufferView"] = copy_view(item["bufferView"])
        if "sparse" in item:
            item["sparse"]["indices"]["bufferView"] = copy_view(item["sparse"]["indices"]["bufferView"])
            item["sparse"]["values"]["bufferView"] = copy_view(item["sparse"]["values"]["bufferView"])
        new_index = len(target.setdefault("accessors", []))
        target["accessors"].append(item)
        accessor_map[source_index] = new_index
        return new_index
    accepted = 0
    for animation in source.get("animations", []):
        original_name = animation.get("name", f"{label}_{accepted}")
        name = original_name if original_name not in known_names else f"{label}_{original_name}"
        if name in known_names: continue
        clip = copy.deepcopy(animation)
        clip["name"] = name
        for sampler in clip.get("samplers", []):
            sampler["input"] = copy_accessor(sampler["input"])
            sampler["output"] = copy_accessor(sampler["output"])
        valid_channels = []
        for channel in clip.get("channels", []):
            node_index = channel["target"]["node"]
            source_node_name = source["nodes"][node_index].get("name")
            if source_node_name not in target_node_by_name: continue
            channel["target"]["node"] = target_node_by_name[source_node_name]
            valid_channels.append(channel)
        clip["channels"] = valid_channels
        if valid_channels:
            target.setdefault("animations", []).append(clip)
            known_names.add(name)
            accepted += 1
    target_binary += source_binary
    return target_binary, accepted

def main():
    root = pathlib.Path(sys.argv[1]).resolve()
    character = root / "vendor/characters/Universal Base Characters[Standard]/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf"
    animation_1 = root / "vendor/animations/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb"
    animation_2 = root / "vendor/animations2/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb"
    out_dir = root / "assets/characters"
    out_dir.mkdir(parents=True, exist_ok=True)
    doc, binary = load_gltf(character)
    base_names = rig_names(doc)
    print(f"Base rig: {len(base_names)} bones")
    names = set()
    count_1 = 0
    binary, count_1 = merge_animation_library(doc, binary, animation_1, "UAL1", names)
    count_2 = 0
    binary, count_2 = merge_animation_library(doc, binary, animation_2, "UAL2", names)
    doc.setdefault("asset", {})["generator"] = "Gordo Royale character pipeline; Quaternius CC0 mesh and animation libraries"
    doc.setdefault("extras", {})["asset_credits"] = "Quaternius Universal Base Characters, Universal Animation Library and Universal Animation Library 2 (CC0 1.0)"
    output = out_dir / "Gordo_Adventurer.glb"
    save_glb(output, doc, binary)
    for uri in (item.get("uri") for item in doc.get("images", [])):
        if not uri: continue
        source_image = character.parent / uri
        if not source_image.is_file() and uri.endswith("_png.png"):
            source_image = character.parent / uri.replace("_png.png", ".png")
        if source_image.is_file():
            (out_dir / uri).write_bytes(source_image.read_bytes())
        else:
            raise FileNotFoundError(source_image)
    print(f"Merged {count_1} + {count_2} clips into {output} ({output.stat().st_size:,} bytes)")
    print("Clips:", ", ".join(sorted(names)))

if __name__ == "__main__": main()

