extends CharacterBody3D
class_name PlayerAvatar
signal attack_triggered

const RIG_SCENE := preload("res://assets/characters/Gordo_Adventurer.glb")
const GRAVITY := 23.0
const WALK_SPEED := 7.1
const SPRINT_SPEED := 11.4

var peer_id := 1
var player_name := "Gordito"
var island: IslandWorld
var local_control := false
var health := 100.0
var stamina := 100.0
var max_stamina := 100.0
var climb_gear := 1
var sword_level := 1
var grenades := 2
var kills := 0
var alive := true
var air_state := "LOBBY"
var inventory: Array[String] = ["Guantes de escalada I", "Espada de chorizo", "Granada de caca ×2"]
var mounted_vehicle: RideableVehicle
var _visual: Node3D
var _animation: AnimationPlayer
var _camera_pivot: Node3D
var _camera: Camera3D
var _climb_ray: RayCast3D
var _glider: Node3D
var _label: Label3D
var _stamina_drain := 0.0
var _attack_cooldown := 0.0
var _grenade_cooldown := 0.0
var _last_animation := ""
var _target_position := Vector3.ZERO
var _target_yaw := 0.0
var aim_yaw := 0.0
var _last_control := {}
var _weapon_root: Node3D
var _parts_color := Color("e28b53")

func _ready() -> void:
	floor_snap_length = 0.28
	floor_max_angle = deg_to_rad(54.0)
	_build_body()
	_build_camera()
	_build_climb_sensor()
	_build_glider()
	_build_nameplate()
	_build_weapon()

func configure(id: int, display_name: String, world: IslandWorld, is_local: bool) -> void:
	peer_id = id
	player_name = display_name
	island = world
	local_control = is_local
	_parts_color = [Color("df764f"), Color("56b5a2"), Color("dda54e"), Color("8b7bc2"), Color("e4d4b5")][absi(id) % 5]

func _build_body() -> void:
	var shape := CapsuleShape3D.new()
	shape.radius = 0.48
	shape.height = 1.8
	var collision := CollisionShape3D.new()
	collision.shape = shape
	collision.position.y = 0.92
	add_child(collision)
	_visual = RIG_SCENE.instantiate() as Node3D
	_visual.name = "QuaterniusHumanoidRig"
	_visual.scale = Vector3.ONE * 0.92
	add_child(_visual)
	_animation = _find_animation_player(_visual)
	var backpack := MeshInstance3D.new()
	var pack_mesh := BoxMesh.new()
	pack_mesh.size = Vector3(0.5, 0.65, 0.3)
	backpack.mesh = pack_mesh
	backpack.position = Vector3(0.0, 1.08, 0.34)
	var pack_material := StandardMaterial3D.new()
	pack_material.albedo_color = _parts_color
	pack_material.roughness = 0.78
	backpack.material_override = pack_material
	_visual.add_child(backpack)
	var belt := MeshInstance3D.new()
	var belt_mesh := CylinderMesh.new()
	belt_mesh.top_radius = 0.44
	belt_mesh.bottom_radius = 0.44
	belt_mesh.height = 0.12
	belt.mesh = belt_mesh
	belt.position.y = 0.91
	var belt_material := StandardMaterial3D.new()
	belt_material.albedo_color = Color("354b47")
	belt.material_override = belt_material
	_visual.add_child(belt)
	if _animation:
		_play_animation("Idle_Loop")

func _find_animation_player(root: Node) -> AnimationPlayer:
	for child in root.get_children():
		if child is AnimationPlayer:
			return child
		var found := _find_animation_player(child)
		if found:
			return found
	return null

func _build_camera() -> void:
	_camera_pivot = Node3D.new()
	_camera_pivot.name = "CameraPivot"
	_camera_pivot.position = Vector3(0.0, 1.52, 0.0)
	add_child(_camera_pivot)
	var spring := SpringArm3D.new()
	spring.spring_length = 5.5
	spring.margin = 0.2
	_camera_pivot.add_child(spring)
	_camera = Camera3D.new()
	_camera.current = local_control
	_camera.fov = 68.0
	_camera.position = Vector3(0.0, 0.45, 0.0)
	spring.add_child(_camera)

func _build_climb_sensor() -> void:
	_climb_ray = RayCast3D.new()
	_climb_ray.position = Vector3(0.0, 1.05, 0.0)
	_climb_ray.target_position = Vector3(0.0, 0.0, -1.25)
	_climb_ray.collision_mask = 1
	_climb_ray.enabled = true
	add_child(_climb_ray)

func _build_nameplate() -> void:
	_label = Label3D.new()
	_label.position.y = 2.3
	_label.font_size = 32
	_label.pixel_size = 0.009
	_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_label.outline_size = 6
	_label.outline_modulate = Color("233039")
	_label.modulate = _parts_color.lightened(0.35)
	_label.text = player_name
	add_child(_label)

func _build_weapon() -> void:
	_weapon_root = Node3D.new()
	_weapon_root.name = "ChorizoBlade"
	_weapon_root.position = Vector3(0.42, 1.0, -0.1)
	var blade := MeshInstance3D.new()
	var blade_mesh := BoxMesh.new()
	blade_mesh.size = Vector3(0.12, 0.9, 0.055)
	blade.mesh = blade_mesh
	blade.position.y = 0.38
	var blade_mat := StandardMaterial3D.new()
	blade_mat.albedo_color = Color("d9e2df")
	blade_mat.metallic = 0.62
	blade_mat.roughness = 0.26
	blade.material_override = blade_mat
	_weapon_root.add_child(blade)
	var handle := MeshInstance3D.new()
	var handle_mesh := CylinderMesh.new()
	handle_mesh.top_radius = 0.055
	handle_mesh.bottom_radius = 0.07
	handle_mesh.height = 0.34
	handle.mesh = handle_mesh
	var handle_mat := StandardMaterial3D.new()
	handle_mat.albedo_color = Color("8e4d2d")
	handle.material_override = handle_mat
	_weapon_root.add_child(handle)
	var guard := MeshInstance3D.new()
	var guard_mesh := BoxMesh.new()
	guard_mesh.size = Vector3(0.36, 0.06, 0.12)
	guard.mesh = guard_mesh
	guard.position.y = 0.15
	guard.material_override = blade_mat
	_weapon_root.add_child(guard)
	add_child(_weapon_root)

func _build_glider() -> void:
	_glider = Node3D.new()
	_glider.name = "DurumKebabGlider"
	_glider.position.y = 2.55
	_glider.visible = false
	add_child(_glider)
	var wrap := MeshInstance3D.new()
	var wrap_mesh := CapsuleMesh.new()
	wrap_mesh.radius = 0.55
	wrap_mesh.height = 6.8
	wrap_mesh.radial_segments = 14
	wrap_mesh.rings = 8
	wrap.mesh = wrap_mesh
	wrap.rotation.z = PI * 0.5
	var bread := StandardMaterial3D.new()
	bread.albedo_color = Color("e9be73")
	bread.roughness = 0.92
	wrap.material_override = bread
	_glider.add_child(wrap)
	for index in 4:
		var filling := MeshInstance3D.new()
		var filling_mesh := BoxMesh.new()
		filling_mesh.size = Vector3(0.18, 0.09, 2.0 + index * 0.2)
		filling.mesh = filling_mesh
		filling.position = Vector3(-0.16 + index * 0.1, 0.36, -0.6 + index * 0.4)
		var filling_mat := StandardMaterial3D.new()
		filling_mat.albedo_color = [Color("72a64e"), Color("dd6250"), Color("d4a23e"), Color("f3e2b4")][index]
		filling.material_override = filling_mat
		_glider.add_child(filling)
	for side in [-1.0, 1.0]:
		var strap := MeshInstance3D.new()
		var strap_mesh := CylinderMesh.new()
		strap_mesh.top_radius = 0.035
		strap_mesh.bottom_radius = 0.035
		strap_mesh.height = 1.6
		strap.mesh = strap_mesh
		strap.position = Vector3(side * 0.45, -0.85, 0.0)
		var strap_mat := StandardMaterial3D.new()
		strap_mat.albedo_color = Color("d8a34e")
		strap.material_override = strap_mat
		_glider.add_child(strap)

func set_nameplate(value: String) -> void:
	player_name = value
	if is_instance_valid(_label):
		_label.text = value

func look_mouse(relative: Vector2) -> void:
	if not local_control or not is_instance_valid(_camera_pivot):
		return
	_camera_pivot.rotation.y -= relative.x * 0.0038
	_camera_pivot.rotation.x = clampf(_camera_pivot.rotation.x - relative.y * 0.0028, deg_to_rad(-48.0), deg_to_rad(25.0))

func camera_yaw() -> float:
	var direction := camera_forward()
	return atan2(-direction.x, -direction.z)

func simulate(delta: float, controls: Dictionary, round_phase: String, bus_position: Vector3) -> void:
	if not alive:
		return
	_attack_cooldown = maxf(0.0, _attack_cooldown - delta)
	_grenade_cooldown = maxf(0.0, _grenade_cooldown - delta)
	var move: Vector2 = controls.get("move", Vector2.ZERO)
	var yaw := float(controls.get("yaw", camera_yaw()))
	aim_yaw = yaw
	var forward := Vector3(-sin(yaw), 0.0, -cos(yaw))
	var right := Vector3(-forward.z, 0.0, forward.x)
	var desired := (right * move.x - forward * move.y).normalized()
	var want_sprint := bool(controls.get("sprint", false)) and move.length() > 0.1 and stamina > 0.0
	if air_state == "BUS":
		global_position = bus_position + Vector3((peer_id % 5 - 2) * 1.15, -2.5, (peer_id % 4 - 1.5) * 1.2)
		velocity = Vector3.ZERO
		_play_animation("Driving_Loop")
		return
	if air_state == "FALL" or air_state == "GLIDE":
		velocity.x = move_toward(velocity.x, desired.x * (6.0 if air_state == "GLIDE" else 1.4), 5.0 * delta)
		velocity.z = move_toward(velocity.z, desired.z * (6.0 if air_state == "GLIDE" else 1.4), 5.0 * delta)
		if air_state == "FALL":
			velocity.y -= GRAVITY * 0.9 * delta
			_play_animation("Jump_Loop")
			if _distance_to_ground() < 18.0:
				air_state = "GLIDE"
				_glider.visible = true
				velocity.y = -7.5
				_play_animation("NinjaJump_Idle_Loop")
		else:
			velocity.y = move_toward(velocity.y, -5.3, 12.0 * delta)
		move_and_slide()
		var landing_y := island.terrain_height(global_position.x, global_position.z)
		if air_state == "GLIDE" and global_position.y <= landing_y + 1.0:
			global_position.y = landing_y + 0.08
			air_state = "GROUND"
			_glider.visible = false
			velocity.y = 0.0
			_play_animation("Jump_Land")
		elif global_position.y < landing_y - 8.0:
			global_position.y = landing_y + 0.08
			air_state = "GROUND"
			_glider.visible = false
			velocity = Vector3.ZERO
		return
	if mounted_vehicle:
		if bool(controls.get("interact", false)):
			mounted_vehicle.release()
			mounted_vehicle = null
		else:
			mounted_vehicle.drive(move, delta, island.terrain_height(mounted_vehicle.position.x, mounted_vehicle.position.z) + 0.2)
			global_position = mounted_vehicle.global_position + Vector3(0.0, 1.0, 0.0)
			rotation.y = mounted_vehicle.rotation.y
			_play_animation("Driving_Loop")
			return
	if bool(controls.get("interact", false)) and Session.is_host:
		_try_interact()
	var in_water := Vector2(global_position.x, global_position.z).length() > 178.0
	if bool(controls.get("climb", false)) and _climb_ray.is_colliding() and stamina > 0.5:
		var collider := _climb_ray.get_collider()
		var grade := int(collider.get_meta("climb_grade", 1)) if collider and collider.has_meta("climb_grade") else 1
		if climb_gear >= grade:
			air_state = "CLIMB"
			stamina = maxf(0.0, stamina - (11.0 + grade * 2.5) * delta)
			var wall_normal := _climb_ray.get_collision_normal()
			velocity = desired * 2.1 + Vector3.UP * (3.8 + grade * 0.35)
			velocity += wall_normal * 0.5
			_play_animation("ClimbUp_1m")
			move_and_slide()
			return
		else:
			stamina = maxf(0.0, stamina - 21.0 * delta)
			air_state = "GROUND"
	if in_water:
		air_state = "SWIM"
		velocity.x = move_toward(velocity.x, desired.x * 3.6, 7.0 * delta)
		velocity.z = move_toward(velocity.z, desired.z * 3.6, 7.0 * delta)
		velocity.y = move_toward(velocity.y, 1.1 if bool(controls.get("jump", false)) else -0.4, 3.5 * delta)
		stamina = maxf(0.0, stamina - 4.0 * delta)
		_play_animation("Swim_Fwd_Loop" if move.length() > 0.1 else "Swim_Idle_Loop")
	elif not is_on_floor():
		velocity.y -= GRAVITY * delta
		air_state = "JUMP"
		if bool(controls.get("jump", false)):
			velocity.y = 8.4
		_play_animation("Jump_Loop")
	else:
		air_state = "SPRINT" if want_sprint else ("RUN" if move.length() > 0.1 else "GROUND")
		var speed := SPRINT_SPEED if want_sprint else WALK_SPEED
		velocity.x = move_toward(velocity.x, desired.x * speed, 28.0 * delta)
		velocity.z = move_toward(velocity.z, desired.z * speed, 28.0 * delta)
		if bool(controls.get("jump", false)):
			velocity.y = 8.4
			air_state = "JUMP"
			_play_animation("Jump_Start")
		elif bool(controls.get("dance", false)):
			air_state = "DANCE"
			_play_animation("Dance_Loop")
		elif bool(controls.get("attack", false)):
			_attack()
		elif want_sprint:
			stamina = maxf(0.0, stamina - 7.0 * delta)
			_play_animation("Sprint_Loop")
		elif move.length() > 0.1:
			stamina = minf(max_stamina, stamina + 9.0 * delta)
			_play_animation("Jog_Fwd_Loop")
		else:
			stamina = minf(max_stamina, stamina + 16.0 * delta)
			_play_animation("Idle_Loop")
	move_and_slide()
	if desired.length() > 0.1 and not mounted_vehicle:
		var target_yaw := atan2(-desired.x, -desired.z)
		rotation.y = lerp_angle(rotation.y, target_yaw, 12.0 * delta)
	var ground_y := island.terrain_height(global_position.x, global_position.z)
	if air_state not in ["BUS", "FALL", "GLIDE", "CLIMB", "SWIM"] and global_position.y < ground_y + 0.08:
		global_position.y = ground_y + 0.08
		velocity.y = 0.0
		if air_state == "JUMP":
			air_state = "GROUND"
	if global_position.y < ground_y - 8.0:
		global_position.y = ground_y + 0.08
		velocity = Vector3.ZERO
		air_state = "GROUND"
		_glider.visible = false

func _distance_to_ground() -> float:
	if not island:
		return INF
	return global_position.y - island.terrain_height(global_position.x, global_position.z)

func _try_interact() -> void:
	for item in island.pickup_nodes:
		if is_instance_valid(item) and item.visible and global_position.distance_to(item.global_position) < 3.2:
			if inventory.size() >= 8:
				Session.notice.emit("Mochila llena: libera un hueco antes de recoger más botín.")
				return
			var name: String = item.get_meta("item", "Botín")
			if name.contains("escalada II"):
				climb_gear = max(climb_gear, 2)
				max_stamina = 125.0
			elif name.contains("escalada III"):
				climb_gear = max(climb_gear, 3)
				max_stamina = 150.0
			elif name.contains("Espada"):
				sword_level = min(5, sword_level + 1)
			elif name.contains("Granada"):
				grenades += 1
			elif name.contains("Botas"):
				max_stamina = maxf(max_stamina, 115.0)
			inventory.append(name)
			item.hide()
			Session.pickup_states[item.name] = false
			Session.notice.emit("Recogido: %s" % name)
			return
	for vehicle in island.vehicle_nodes:
		if vehicle is RideableVehicle and global_position.distance_to(vehicle.global_position) < 4.0 and vehicle.occupant_id == 0:
			mounted_vehicle = vehicle
			vehicle.occupant_id = peer_id
			Session.notice.emit("Subido a %s" % vehicle.display_name)
			return

func _attack() -> void:
	if _attack_cooldown > 0.0:
		return
	_attack_cooldown = maxf(0.45, 0.8 - sword_level * 0.06)
	_play_animation("Sword_Regular_A" if sword_level < 3 else "Sword_Heavy_Combo")
	if _weapon_root:
		_weapon_root.rotation.x = -0.7
	attack_triggered.emit()

func throw_grenade() -> bool:
	if grenades <= 0 or _grenade_cooldown > 0.0:
		return false
	grenades -= 1
	_grenade_cooldown = 1.2
	return true

func apply_network_state(state: Dictionary, smooth := true) -> void:
	if state.has("name"):
		set_nameplate(str(state["name"]))
	if state.has("health"):
		health = float(state["health"])
	if state.has("stamina"):
		stamina = float(state["stamina"])
	if state.has("max_stamina"):
		max_stamina = float(state["max_stamina"])
	if state.has("climb_gear"):
		climb_gear = int(state["climb_gear"])
	if state.has("sword"):
		sword_level = int(state["sword"])
	if state.has("grenades"):
		grenades = int(state["grenades"])
	if state.has("kills"):
		kills = int(state["kills"])
	if state.has("alive"):
		alive = bool(state["alive"])
		visible = alive
	if state.has("air_state"):
		air_state = str(state["air_state"])
	if state.has("inventory"):
		inventory.clear()
		for item in state["inventory"]:
			inventory.append(str(item))
	if state.has("vehicle"):
		mounted_vehicle = null
		var vehicle_name := str(state["vehicle"])
		if not vehicle_name.is_empty():
			for vehicle in island.vehicle_nodes:
				if vehicle.name == vehicle_name and vehicle is RideableVehicle:
					mounted_vehicle = vehicle
					break
	if state.has("position"):
		_target_position = state["position"]
		if not local_control:
			global_position = global_position.lerp(_target_position, 0.55 if smooth else 1.0)
	if state.has("yaw"):
		_target_yaw = float(state["yaw"])
		if not local_control:
			rotation.y = lerp_angle(rotation.y, _target_yaw, 0.45)
	if state.has("aim_yaw"):
		aim_yaw = float(state["aim_yaw"])
		if not local_control:
			_camera_pivot.rotation.y = aim_yaw - rotation.y
	_glider.visible = alive and air_state == "GLIDE"

func network_state() -> Dictionary:
	return {"name": player_name, "position": global_position, "yaw": rotation.y, "aim_yaw": aim_yaw, "air_state": air_state, "health": health, "stamina": stamina, "max_stamina": max_stamina, "climb_gear": climb_gear, "sword": sword_level, "grenades": grenades, "kills": kills, "alive": alive, "inventory": inventory, "vehicle": mounted_vehicle.name if is_instance_valid(mounted_vehicle) else ""}

func camera_forward() -> Vector3:
	if not local_control:
		return Vector3(-sin(aim_yaw), 0.0, -cos(aim_yaw)).normalized()
	var direction := -_camera_pivot.global_basis.z
	direction.y = 0.0
	return direction.normalized()

func _play_animation(animation_name: String) -> void:
	if not _animation or not _animation.has_animation(animation_name) or _last_animation == animation_name:
		return
	_last_animation = animation_name
	_animation.play(animation_name, 0.18)


