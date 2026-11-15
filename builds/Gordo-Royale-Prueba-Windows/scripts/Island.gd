extends Node3D
class_name IslandWorld

const WORLD_SIZE := 360.0
const WORLD_STEPS := 90
const CHARACTER_SCENE := preload("res://assets/characters/Gordo_Adventurer.glb")

var bus: Node3D
var bus_route: Node3D
var vehicle_nodes: Array[Node3D] = []
var pickup_nodes: Array[Node3D] = []
var storm_radius := 170.0
var _wind_clock := 0.0
var _birds: Array[Node3D] = []

func _ready() -> void:
	_build_environment()
	_build_terrain()
	_build_biomes()
	_build_landmarks()
	_build_bus()
	_build_vehicles()
	_build_pickups()
	_build_storm_ring()

func _process(delta: float) -> void:
	_wind_clock += delta
	var phase := Session.phase
	if bus:
		bus.visible = phase in ["COUNTDOWN", "BUS"]
		if phase in ["COUNTDOWN", "BUS"]:
			var t: float = Session.round_clock
			bus.position = Vector3(-145.0 + fposmod(t * 13.0, 290.0), 162.0 + sin(t * 0.35) * 2.0, -12.0 + sin(t * 0.16) * 9.0)
			bus.rotation.y = 0.0
	for index in _birds.size():
		var bird := _birds[index]
		var angle := _wind_clock * (0.07 + index * 0.002) + index * TAU / maxf(1.0, float(_birds.size()))
		bird.position = Vector3(cos(angle) * 112.0, 47.0 + sin(_wind_clock * 1.4 + index) * 5.0, sin(angle) * 112.0)
		bird.rotation.y = -angle
	if has_node("StormRing"):
		get_node("StormRing").scale = Vector3(storm_radius, 1.0, storm_radius)

func terrain_height(x: float, z: float) -> float:
	var r := Vector2(x, z).length()
	var coast := clampf(1.0 - r / 190.0, 0.0, 1.0)
	var mountain := 39.0 * exp(-(((x - 8.0) * (x - 8.0)) / 4300.0 + ((z + 4.0) * (z + 4.0)) / 4900.0))
	var ridge := 15.0 * exp(-pow((x + z * 0.72 - 5.0) / 28.0, 2.0))
	var noise := sin(x * 0.045) * cos(z * 0.037) * 2.0 + sin((x + z) * 0.1) * 0.7
	return maxf(-9.0, coast * (5.0 + mountain + ridge + noise) - 3.0)

func _build_environment() -> void:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sky_material := ProceduralSkyMaterial.new()
	sky_material.sky_top_color = Color("478bb7")
	sky_material.sky_horizon_color = Color("f4c684")
	sky_material.ground_bottom_color = Color("253c37")
	sky_material.ground_horizon_color = Color("cfb17c")
	sky_material.sun_angle_max = 18.0
	sky.sky_material = sky_material
	environment.sky = sky
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("c6dddf")
	environment.ambient_light_energy = 0.72
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.glow_enabled = true
	world_environment.environment = environment
	add_child(world_environment)
	var sun := DirectionalLight3D.new()
	sun.name = "SunsetKeyLight"
	sun.rotation_degrees = Vector3(-44.0, -27.0, 0.0)
	sun.light_color = Color("ffe0ac")
	sun.light_energy = 1.45
	sun.shadow_enabled = true
	add_child(sun)
	var fill := OmniLight3D.new()
	fill.position = Vector3(0.0, 55.0, 0.0)
	fill.light_color = Color("6cbfd0")
	fill.light_energy = 0.6
	fill.omni_range = 180.0
	add_child(fill)

func _build_terrain() -> void:
	var tool := SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	var step := WORLD_SIZE / float(WORLD_STEPS)
	for iz in WORLD_STEPS:
		for ix in WORLD_STEPS:
			var x := -WORLD_SIZE * 0.5 + ix * step
			var z := -WORLD_SIZE * 0.5 + iz * step
			var p00 := Vector3(x, terrain_height(x, z), z)
			var p10 := Vector3(x + step, terrain_height(x + step, z), z)
			var p01 := Vector3(x, terrain_height(x, z + step), z + step)
			var p11 := Vector3(x + step, terrain_height(x + step, z + step), z + step)
			_add_terrain_triangle(tool, p00, p01, p10)
			_add_terrain_triangle(tool, p10, p01, p11)
	tool.generate_normals()
	var terrain_mesh := tool.commit()
	var surface := MeshInstance3D.new()
	surface.name = "FourBiomesTerrain"
	surface.mesh = terrain_mesh
	var terrain_material := StandardMaterial3D.new()
	terrain_material.vertex_color_use_as_albedo = true
	terrain_material.roughness = 0.93
	terrain_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	terrain_material.metallic = 0.0
	surface.material_override = terrain_material
	add_child(surface)
	var ground := StaticBody3D.new()
	ground.name = "IslandCollision"
	var collision := CollisionShape3D.new()
	var shape := ConcavePolygonShape3D.new()
	shape.set_faces(terrain_mesh.get_faces())
	collision.shape = shape
	ground.add_child(collision)
	add_child(ground)
	var water := MeshInstance3D.new()
	water.name = "AguasMediterraneas"
	var water_mesh := PlaneMesh.new()
	water_mesh.size = Vector2(1800.0, 1800.0)
	water.mesh = water_mesh
	water.position.y = -2.0
	var water_material := StandardMaterial3D.new()
	water_material.albedo_color = Color("214857")
	water_material.roughness = 0.18
	water_material.metallic = 0.24
	water_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	water_material.albedo_color.a = 0.9
	water.material_override = water_material
	add_child(water)

func _add_terrain_triangle(tool: SurfaceTool, a: Vector3, b: Vector3, c: Vector3) -> void:
	for point in [a, b, c]:
		tool.set_color(_biome_color(point.x, point.z, point.y))
		tool.add_vertex(point)

func _biome_color(x: float, z: float, height: float) -> Color:
	if height > 31.0:
		return Color("c6c6b3").lerp(Color("f0e7d1"), clampf((height - 31.0) / 18.0, 0.0, 0.6))
	if x < -65.0:
		return Color("dcbf83").lerp(Color("e8d298"), clampf((x + 175.0) / 110.0, 0.0, 0.4))
	if x > 54.0:
		return Color("396b45").lerp(Color("63834b"), clampf((sin(z * 0.04) + 1.0) * 0.3, 0.0, 0.65))
	if z < -82.0:
		return Color("8a6142").lerp(Color("bd7950"), clampf((height - 8.0) / 30.0, 0.0, 0.35))
	if z > 80.0:
		return Color("537d70").lerp(Color("8ba67a"), clampf((height - 5.0) / 25.0, 0.0, 0.4))
	return Color("78905a").lerp(Color("9a9a62"), clampf(height / 55.0, 0.0, 0.45))

func _build_biomes() -> void:
	_build_forest()
	_build_palms()
	_build_rocks()
	_build_birds()
	for data in [["COSTA DORADA", Vector3(-116.0, 2.0, 26.0), Color("f2ca79")], ["PINAR DEL NORTE", Vector3(89.0, 2.0, -58.0), Color("98cf83")], ["CALDERA", Vector3(16.0, 24.0, -58.0), Color("f18353")], ["MARISMA", Vector3(28.0, 2.0, 111.0), Color("7ad3c2")]]:
		var label := Label3D.new()
		label.text = data[0]
		label.font_size = 42
		label.pixel_size = 0.01
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.modulate = data[2]
		label.outline_size = 8
		label.outline_modulate = Color("202c2c")
		label.position = data[1]
		add_child(label)

func _build_forest() -> void:
	var tree := CylinderMesh.new()
	tree.top_radius = 0.16
	tree.bottom_radius = 0.34
	tree.height = 4.8
	tree.radial_segments = 7
	var trunk_mat := StandardMaterial3D.new()
	trunk_mat.albedo_color = Color("654834")
	trunk_mat.roughness = 0.96
	var crown := PrismMesh.new()
	crown.size = Vector3(4.0, 5.0, 4.0)
	var crown_mat := StandardMaterial3D.new()
	crown_mat.albedo_color = Color("426e43")
	crown_mat.roughness = 0.9
	var trunk_mm := _make_multimesh(tree, trunk_mat, 110)
	var crown_mm := _make_multimesh(crown, crown_mat, 110)
	var index := 0
	var random := RandomNumberGenerator.new()
	random.seed = 74123
	while index < 110:
		var x := random.randf_range(53.0, 157.0)
		var z := random.randf_range(-153.0, 153.0)
		if terrain_height(x, z) < 2.0 or Vector2(x, z).length() < 45.0:
			continue
		var scale := random.randf_range(0.65, 1.35)
		var ground_y := terrain_height(x, z)
		var tr := Transform3D(Basis().scaled(Vector3(scale, scale, scale)), Vector3(x, ground_y + 2.3 * scale, z))
		trunk_mm.multimesh.set_instance_transform(index, tr)
		var crown_transform := Transform3D(Basis().scaled(Vector3(scale, scale, scale)), Vector3(x, ground_y + 5.2 * scale, z))
		crown_mm.multimesh.set_instance_transform(index, crown_transform)
		index += 1
	add_child(trunk_mm)
	add_child(crown_mm)

func _make_multimesh(mesh: Mesh, material: Material, amount: int) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh
	mm.instance_count = amount
	var instance := MultiMeshInstance3D.new()
	instance.multimesh = mm
	instance.material_override = material
	return instance

func _build_palms() -> void:
	var trunk_mesh := CylinderMesh.new()
	trunk_mesh.top_radius = 0.12
	trunk_mesh.bottom_radius = 0.55
	trunk_mesh.height = 7.0
	trunk_mesh.radial_segments = 7
	var trunk_mat := StandardMaterial3D.new()
	trunk_mat.albedo_color = Color("806146")
	var trunk_group := _make_multimesh(trunk_mesh, trunk_mat, 36)
	var leaf_mesh := PrismMesh.new()
	leaf_mesh.size = Vector3(4.8, 0.28, 1.1)
	var leaf_mat := StandardMaterial3D.new()
	leaf_mat.albedo_color = Color("57835a")
	var leaves: Array[MultiMeshInstance3D] = []
	for leaf in 6:
		leaves.append(_make_multimesh(leaf_mesh, leaf_mat, 36))
	var random := RandomNumberGenerator.new()
	random.seed = 611
	for index in 36:
		var x := random.randf_range(-130.0, -60.0)
		var z := random.randf_range(-115.0, 115.0)
		var h := terrain_height(x, z)
		var s := random.randf_range(0.8, 1.35)
		trunk_group.multimesh.set_instance_transform(index, Transform3D(Basis().scaled(Vector3(s * 0.65, s, s * 0.65)), Vector3(x, h + 3.4 * s, z)))
		for leaf_index in 6:
			var rot := leaf_index * TAU / 6.0
			var basis := Basis(Vector3.UP, rot).scaled(Vector3(s, s, s))
			leaves[leaf_index].multimesh.set_instance_transform(index, Transform3D(basis, Vector3(x, h + 6.6 * s, z)))
	add_child(trunk_group)
	for group in leaves:
		add_child(group)

func _build_rocks() -> void:
	var rock_mesh := SphereMesh.new()
	rock_mesh.radius = 1.0
	rock_mesh.height = 1.5
	rock_mesh.radial_segments = 7
	rock_mesh.rings = 4
	var rock_mat := StandardMaterial3D.new()
	rock_mat.albedo_color = Color("716858")
	rock_mat.roughness = 0.98
	var group := _make_multimesh(rock_mesh, rock_mat, 68)
	var random := RandomNumberGenerator.new()
	random.seed = 779
	for index in 68:
		var angle := random.randf_range(0.0, TAU)
		var radius := random.randf_range(42.0, 135.0)
		var x: float = cos(angle) * radius
		var z: float = sin(angle) * radius
		var height := terrain_height(x, z)
		var scale := random.randf_range(1.0, 4.0)
		var basis := Basis(Vector3.UP, random.randf_range(-PI, PI)).scaled(Vector3(scale, scale * random.randf_range(0.55, 1.3), scale * random.randf_range(0.7, 1.4)))
		group.multimesh.set_instance_transform(index, Transform3D(basis, Vector3(x, height + scale * 0.35, z)))
	add_child(group)

func _build_birds() -> void:
	for index in 13:
		var bird := Node3D.new()
		var body := MeshInstance3D.new()
		var body_mesh := CapsuleMesh.new()
		body_mesh.radius = 0.22
		body_mesh.height = 0.9
		body.mesh = body_mesh
		body.rotation.z = PI * 0.5
		var material := StandardMaterial3D.new()
		material.albedo_color = Color("354b55")
		body.material_override = material
		bird.add_child(body)
		for side in [-1.0, 1.0]:
			var wing := MeshInstance3D.new()
			var wing_mesh := BoxMesh.new()
			wing_mesh.size = Vector3(1.1, 0.08, 0.32)
			wing.mesh = wing_mesh
			wing.position.x = side * 0.58
			wing.name = "Wing"
			bird.add_child(wing)
		add_child(bird)
		_birds.append(bird)

func _build_landmarks() -> void:
	_build_lighthouse(Vector3(-105.0, terrain_height(-105.0, 3.0), 3.0))
	_build_kiosk(Vector3(34.0, terrain_height(34.0, 94.0), 94.0))
	_build_climb_towers()
	_build_enemy_camps()

func _build_lighthouse(at: Vector3) -> void:
	var root := Node3D.new()
	root.position = at
	var tower := _box(Vector3(5.0, 24.0, 5.0), Color("f0e4c5"), Vector3(0.0, 12.0, 0.0))
	root.add_child(tower)
	var stripe := _box(Vector3(5.2, 4.0, 5.2), Color("d66a50"), Vector3(0.0, 11.0, 0.0))
	root.add_child(stripe)
	var roof := _box(Vector3(7.0, 1.5, 7.0), Color("374650"), Vector3(0.0, 24.0, 0.0))
	root.add_child(roof)
	var lamp := OmniLight3D.new()
	lamp.position = Vector3(0.0, 24.5, 0.0)
	lamp.light_color = Color("ffd58a")
	lamp.light_energy = 1.8
	lamp.omni_range = 30.0
	root.add_child(lamp)
	add_child(root)

func _build_kiosk(at: Vector3) -> void:
	var root := Node3D.new()
	root.position = at
	var body := _box(Vector3(11.0, 4.0, 8.0), Color("e9c577"), Vector3(0.0, 2.0, 0.0))
	root.add_child(body)
	var canopy := _box(Vector3(13.0, 0.6, 9.0), Color("dc6846"), Vector3(0.0, 4.6, 0.0))
	root.add_child(canopy)
	var sign := Label3D.new()
	sign.text = "KIOSKO DEL KEBAB"
	sign.font_size = 48
	sign.pixel_size = 0.006
	sign.position = Vector3(0.0, 3.8, 4.1)
	sign.modulate = Color("fff0c8")
	root.add_child(sign)
	add_child(root)

func _build_climb_towers() -> void:
	var positions := [Vector3(-38, terrain_height(-38, -5), -5), Vector3(6, terrain_height(6, 7), 7), Vector3(49, terrain_height(49, -3), -3)]
	for index in positions.size():
		var tower := StaticBody3D.new()
		tower.name = "MuroEscalable_%d" % (index + 1)
		tower.set_meta("climb_grade", index + 1)
		tower.position = positions[index]
		var mesh_instance := MeshInstance3D.new()
		var mesh := CylinderMesh.new()
		mesh.top_radius = 8.0
		mesh.bottom_radius = 11.0
		mesh.height = 16.0 + index * 7.0
		mesh.radial_segments = 8
		mesh_instance.mesh = mesh
		var mat := StandardMaterial3D.new()
		mat.albedo_color = [Color("847f6c"), Color("aa6c4a"), Color("dad9ca")][index]
		mat.roughness = 0.91
		mesh_instance.material_override = mat
		mesh_instance.position.y = mesh.height * 0.5
		tower.add_child(mesh_instance)
		var shape := CollisionShape3D.new()
		var cylinder := CylinderShape3D.new()
		cylinder.radius = 9.0 + index
		cylinder.height = mesh.height
		shape.shape = cylinder
		shape.position.y = mesh.height * 0.5
		tower.add_child(shape)
		add_child(tower)

func _build_enemy_camps() -> void:
	for data in [["La Cabra del Monte", Vector3(2.0, terrain_height(2.0, -32.0), -32.0), 2], ["El Rey de la Calima", Vector3(-108.0, terrain_height(-108.0, -40.0), -40.0), 3], ["Señora Marisma", Vector3(98.0, terrain_height(98.0, 90.0), 90.0), 4]]:
		var marker := _box(Vector3(3.0, 5.0, 3.0), Color("d7844f"), data[1] + Vector3(0, 2.5, 0))
		marker.name = "Campamento_" + str(data[0]).replace(" ", "_")
		marker.set_meta("guardian_name", data[0])
		marker.set_meta("reward_sword", data[2])
		add_child(marker)

func _build_bus() -> void:
	bus = Node3D.new()
	bus.name = "Bus_Aereo_Bajada_Express"
	bus.scale = Vector3(2.6, 2.6, 2.6)
	bus.visible = false
	add_child(bus)
	var chassis := _box(Vector3(8.8, 3.3, 22.0), Color("f3eee0"), Vector3(0, 1.9, 0))
	bus.add_child(chassis)
	var roof := _box(Vector3(8.5, 0.45, 21.4), Color("e4e0d4"), Vector3(0, 3.78, 0))
	bus.add_child(roof)
	var stripe := _box(Vector3(9.0, 0.34, 21.8), Color("d9553b"), Vector3(0, 1.0, 0))
	bus.add_child(stripe)
	for side in [-1.0, 1.0]:
		for index in 7:
			var window := _box(Vector3(0.08, 1.0, 2.25), Color("324d58"), Vector3(side * 4.46, 2.55, -8.5 + index * 2.7))
			bus.add_child(window)
		for z in [-7.0, 7.0]:
			var wheel := MeshInstance3D.new()
			var wheel_mesh := CylinderMesh.new()
			wheel_mesh.top_radius = 0.8
			wheel_mesh.bottom_radius = 0.8
			wheel_mesh.height = 0.34
			wheel_mesh.radial_segments = 16
			wheel.mesh = wheel_mesh
			wheel.rotation.z = PI * 0.5
			wheel.position = Vector3(side * 4.35, 0.55, z)
			var wheel_mat := StandardMaterial3D.new()
			wheel_mat.albedo_color = Color("263338")
			wheel.material_override = wheel_mat
			bus.add_child(wheel)
	var sign := Label3D.new()
	sign.text = "BAJADA EXPRESS"
	sign.font_size = 62
	sign.pixel_size = 0.004
	sign.position = Vector3(0.0, 2.6, -11.1)
	sign.rotation.y = PI
	sign.modulate = Color("b7352a")
	bus.add_child(sign)
	var side_sign := Label3D.new()
	side_sign.text = "BAJADA EXPRESS"
	side_sign.font_size = 42
	side_sign.pixel_size = 0.005
	side_sign.position = Vector3(4.51, 2.55, 0.0)
	side_sign.rotation.y = -PI * 0.5
	side_sign.modulate = Color("b7352a")
	bus.add_child(side_sign)
	var tail := _box(Vector3(0.8, 0.1, 15.0), Color("f0a34f"), Vector3(0.0, 4.04, 0.0))
	bus.add_child(tail)
	var door := _box(Vector3(0.09, 2.4, 1.7), Color("445660"), Vector3(4.5, 1.9, 8.9))
	bus.add_child(door)

func _build_storm_ring() -> void:
	var ring := MeshInstance3D.new()
	ring.name = "StormRing"
	var torus := TorusMesh.new()
	torus.inner_radius = 0.992
	torus.outer_radius = 1.0
	torus.rings = 4
	torus.ring_segments = 128
	ring.mesh = torus
	ring.position.y = 0.4
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("f8da7c")
	material.emission_enabled = true
	material.emission = Color("d79c4a")
	material.emission_energy_multiplier = 0.8
	ring.material_override = material
	add_child(ring)

func _build_vehicles() -> void:
	var bike := _vehicle("Moto con sidecar", Vector3(-62.0, terrain_height(-62.0, 10.0), 10.0), Color("d84e3f"), true)
	vehicle_nodes.append(bike)
	var scooter := _vehicle("Patinete eléctrico", Vector3(52.0, terrain_height(52.0, 34.0), 34.0), Color("e3c66f"), false)
	vehicle_nodes.append(scooter)

func _vehicle(label_text: String, at: Vector3, body_color: Color, sidecar: bool) -> Node3D:
	var root := Node3D.new()
	root.set_script(preload("res://scripts/Rideable.gd"))
	root.name = label_text.replace(" ", "_")
	root.display_name = label_text
	root.max_speed = 22.0 if sidecar else 15.0
	root.is_sidecar = sidecar
	root.position = at
	root.set_meta("spawn_position", at)
	root.set_meta("vehicle_name", label_text)
	root.set_meta("sidecar", sidecar)
	var body := _box(Vector3(1.2, 0.75, 2.5), body_color, Vector3(0, 1.0, 0))
	root.add_child(body)
	var wheel_mesh := CylinderMesh.new()
	wheel_mesh.top_radius = 0.62
	wheel_mesh.bottom_radius = 0.62
	wheel_mesh.height = 0.26
	wheel_mesh.radial_segments = 16
	for z in [-0.95, 0.95]:
		var wheel := MeshInstance3D.new()
		wheel.mesh = wheel_mesh
		wheel.rotation.z = PI * 0.5
		wheel.position = Vector3(0, 0.65, z)
		var rubber := StandardMaterial3D.new()
		rubber.albedo_color = Color("252b2b")
		wheel.material_override = rubber
		root.add_child(wheel)
	var seat := _box(Vector3(0.75, 0.18, 0.72), Color("372d29"), Vector3(0, 1.52, -0.05))
	root.add_child(seat)
	var handle := _box(Vector3(1.25, 0.1, 0.12), Color("414f52"), Vector3(0, 1.85, 0.8))
	root.add_child(handle)
	if sidecar:
		var pod := _box(Vector3(1.6, 0.75, 1.55), Color("e8d8bb"), Vector3(1.15, 0.9, -0.05))
		root.add_child(pod)
		var pod_wheel := MeshInstance3D.new()
		pod_wheel.mesh = wheel_mesh
		pod_wheel.rotation.z = PI * 0.5
		pod_wheel.position = Vector3(1.15, 0.55, 0.1)
		pod_wheel.material_override = StandardMaterial3D.new()
		pod_wheel.material_override.albedo_color = Color("252b2b")
		root.add_child(pod_wheel)
	else:
		var deck := _box(Vector3(0.52, 0.14, 1.15), Color("343e3b"), Vector3(0, 0.95, 0))
		root.add_child(deck)
	var badge := Label3D.new()
	badge.text = label_text.to_upper()
	badge.font_size = 24
	badge.pixel_size = 0.008
	badge.position = Vector3(0, 2.25, 0)
	badge.modulate = Color("fff0d2")
	root.add_child(badge)
	add_child(root)
	return root

func _build_pickups() -> void:
	for index in 7:
		var angle := index * TAU / 7.0
		var radius: float = [54.0, 72.0, 98.0, 66.0, 116.0, 89.0, 128.0][index]
		var x: float = cos(angle) * radius
		var z: float = sin(angle) * radius
		var root := Node3D.new()
		root.name = "Botin_%d" % index
		root.position = Vector3(x, terrain_height(x, z) + 0.6, z)
		root.set_meta("item", ["Guantes de escalada II", "Guantes de escalada III", "Espada de chorizo", "Granada de caca", "Botas de suela", "Espada de morcilla", "Granada de caca"][index])
		var orb := MeshInstance3D.new()
		var sphere := SphereMesh.new()
		sphere.radius = 0.32
		sphere.height = 0.64
		orb.mesh = sphere
		var mat := StandardMaterial3D.new()
		mat.albedo_color = [Color("8bd6a2"), Color("ffe17b"), Color("c9d4e0")][index % 3]
		mat.emission_enabled = true
		mat.emission = mat.albedo_color
		mat.emission_energy_multiplier = 0.55
		orb.material_override = mat
		root.add_child(orb)
		var label := Label3D.new()
		label.text = "BOTÍN"
		label.font_size = 27
		label.pixel_size = 0.009
		label.position.y = 0.8
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.modulate = Color("fff0c8")
		root.add_child(label)
		add_child(root)
		pickup_nodes.append(root)

func apply_pickup_states(states: Dictionary) -> void:
	for pickup in pickup_nodes:
		if is_instance_valid(pickup) and states.has(pickup.name):
			pickup.visible = bool(states[pickup.name])

func reset_round_world() -> void:
	storm_radius = 170.0
	for vehicle in vehicle_nodes:
		if vehicle is RideableVehicle:
			vehicle.position = vehicle.get_meta("spawn_position", vehicle.position)
			vehicle.rotation = Vector3.ZERO
			vehicle.velocity = Vector3.ZERO
			vehicle.release()
	for index in range(pickup_nodes.size() - 1, -1, -1):
		var pickup := pickup_nodes[index]
		if not is_instance_valid(pickup):
			pickup_nodes.remove_at(index)
		elif bool(pickup.get_meta("round_drop", false)):
			pickup.queue_free()
			pickup_nodes.remove_at(index)
		else:
			pickup.show()
	Session.pickup_states.clear()
	for pickup in pickup_nodes:
		if is_instance_valid(pickup):
			Session.pickup_states[pickup.name] = true

func spawn_pickup(item_name: String, at: Vector3) -> void:
	var root := Node3D.new()
	root.name = "Botin_" + item_name.replace(" ", "_")
	root.position = at
	root.set_meta("item", item_name)
	root.set_meta("round_drop", true)
	var orb := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 0.34
	sphere.height = 0.68
	orb.mesh = sphere
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("ffe17b")
	material.emission_enabled = true
	material.emission = Color("e7b74b")
	material.emission_energy_multiplier = 0.7
	orb.material_override = material
	root.add_child(orb)
	var label := Label3D.new()
	label.text = item_name.to_upper()
	label.font_size = 24
	label.pixel_size = 0.009
	label.position.y = 0.9
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.modulate = Color("fff0c8")
	root.add_child(label)
	add_child(root)
	pickup_nodes.append(root)

func _box(size: Vector3, color: Color, at: Vector3) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = size
	instance.mesh = box
	instance.position = at
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.78
	instance.material_override = material
	return instance







