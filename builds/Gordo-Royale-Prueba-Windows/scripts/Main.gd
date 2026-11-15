extends Node3D

const WORLD_SCRIPT := preload("res://scripts/Island.gd")
const AVATAR_SCRIPT := preload("res://scripts/PlayerAvatar.gd")
const RIDEABLE_SCRIPT := preload("res://scripts/Rideable.gd")

var island: IslandWorld
var actors: Dictionary = {}
var guardians: Dictionary = {}
var guardian_spawn_positions: Dictionary = {}
var guardian_spawn_swords: Dictionary = {}
var grenades_live: Array[Dictionary] = []
var inventory_open := false
var mouse_captured := false
var _input_timer := 0.0
var _local_controls: Dictionary = {"move": Vector2.ZERO, "yaw": 0.0, "jump": false, "sprint": false, "climb": false, "attack": false, "grenade": false, "interact": false, "dance": false}
var _hud_timer := 0.0
var _home_panel: Control
var _lobby_panel: Control
var _hud: Control
var _inventory_panel: Control
var _end_panel: Control
var _toast: Label
var _player_list: VBoxContainer
var _lobby_count: Label
var _lobby_status: Label
var _host_button: Button
var _join_button: Button
var _ready_button: Button
var _start_button: Button
var _bots_button: Button
var bot_grenade_timers: Dictionary = {}
var _name_field: LineEdit
var _address_field: LineEdit
var _invite_label: Label
var _timer_label: Label
var _health_bar: ProgressBar
var _stamina_bar: ProgressBar
var _gear_label: Label
var _sword_label: Label
var _grenade_label: Label
var _storm_label: Label
var _inventory_list: VBoxContainer
var _inventory_status: Label
var _winner_label: Label
var _last_storm_tick := 0.0

func _ready() -> void:
	island = WORLD_SCRIPT.new()
	island.name = "IslaDelPlato"
	add_child(island)
	_build_interface()
	Session.room_changed.connect(_sync_player_nodes)
	Session.phase_changed.connect(_on_phase_changed)
	Session.snapshot_received.connect(_apply_snapshot)
	Session.notice.connect(_show_toast)
	Session.grenade_requested.connect(_on_grenade_requested)
	Session.grenade_detonated.connect(_on_grenade_detonated)
	Session.grenade_thrown.connect(_on_grenade_thrown)
	_spawn_preview()
	_spawn_guardians()
	_update_interface()
	if OS.get_cmdline_user_args().has("--solo-bots"):
		call_deferred("_start_solo_bots")

func _physics_process(delta: float) -> void:
	if Session.phase in ["BUS", "MATCH"]:
		var local_actor: PlayerAvatar = actors.get(Session.local_peer_id)
		if local_actor and local_actor.alive:
			var controls := _sample_controls(local_actor)
			if Session.phase == "BUS" and controls["jump"]:
				Session.request_drop_local()
				controls["jump"] = false
			elif Session.phase == "MATCH" and controls["jump"] and not Session.is_host:
				Session.request_jump_local()
			_local_controls = controls
			_input_timer += delta
			if _input_timer >= 0.05:
				_input_timer = 0.0
				Session.send_input(_local_controls)
		else:
			_local_controls["move"] = Vector2.ZERO
			_local_controls["jump"] = false
			_local_controls["attack"] = false
			_local_controls["interact"] = false
			_local_controls["dance"] = false
	else:
		_local_controls["move"] = Vector2.ZERO
		_local_controls["jump"] = false
		_local_controls["interact"] = false
		_local_controls["dance"] = false
	for key in actors.keys():
		var actor: PlayerAvatar = actors[key]
		if not is_instance_valid(actor) or not actor.alive:
			continue
		var peer_id := int(key)
		if Session.phase not in ["BUS", "MATCH"]:
			continue
		if Session.is_host or peer_id == Session.local_peer_id:
			var controls: Dictionary
			if Session.is_host and bool(Session.players.get(peer_id, {}).get("is_bot", false)):
				controls = _bot_controls(actor, delta)
			elif Session.is_host and peer_id != Session.local_peer_id:
				controls = Session.get_input_for(peer_id)
				controls["jump"] = Session.consume_jump(peer_id)
				controls["interact"] = Session.consume_interact(peer_id)
				controls["dance"] = Session.consume_dance(peer_id)
			else:
				controls = _local_controls
			var bus_pos := island.bus.global_position if is_instance_valid(island.bus) else Vector3(0.0, 160.0, 0.0)
			actor.simulate(delta, controls, Session.phase, bus_pos)
			if Session.is_host:
				Session.update_authoritative_state(peer_id, actor.network_state())
	if Session.is_host:
		for vehicle in island.vehicle_nodes:
			if vehicle is RideableVehicle:
				Session.vehicle_states[vehicle.name] = vehicle.network_state()
	if Session.is_host and Session.phase == "MATCH":
		_tick_guardians(delta)
		_tick_grenades(delta)
		_tick_storm(delta)
		for key in guardians.keys():
			var guardian: PlayerAvatar = guardians[key]
			Session.npc_states[str(key)] = guardian.network_state()

func _bot_controls(actor: PlayerAvatar, delta: float) -> Dictionary:
	var controls := {"move": Vector2.ZERO, "yaw": actor.rotation.y, "jump": false, "sprint": false, "climb": false, "attack": false, "grenade": false, "interact": false, "dance": false}
	if Session.phase == "BUS":
		var drop_at := 0.8 + float(actor.peer_id % 9) * 0.38
		if actor.air_state == "BUS" and Session.round_clock >= drop_at:
			Session._set_dropped(actor.peer_id)
		return controls
	if Session.phase != "MATCH":
		return controls
	var enemy: PlayerAvatar
	var enemy_distance := INF
	for raw_id in Session.players.keys():
		var other_id := int(raw_id)
		if other_id == actor.peer_id:
			continue
		var candidate: PlayerAvatar = actors.get(other_id)
		if not candidate or not candidate.alive:
			continue
		var distance := actor.global_position.distance_to(candidate.global_position)
		if distance < enemy_distance:
			enemy = candidate
			enemy_distance = distance
	for raw_id in guardians.keys():
		var candidate: PlayerAvatar = guardians[raw_id]
		if not candidate.alive:
			continue
		var distance := actor.global_position.distance_to(candidate.global_position)
		if distance < enemy_distance:
			enemy = candidate
			enemy_distance = distance
	var chasing_enemy := enemy != null and enemy_distance < 48.0
	var chasing_pickup := false
	var goal := Vector3.ZERO
	if actor.air_state in ["FALL", "GLIDE"]:
		var angle := float(actor.peer_id % 20) * TAU / 20.0
		goal = Vector3(cos(angle) * 52.0, 0.0, sin(angle) * 52.0)
	elif chasing_enemy:
		goal = enemy.global_position
	else:
		var nearest_pickup: Node3D
		var pickup_distance := INF
		if actor.inventory.size() < 8:
			for pickup in island.pickup_nodes:
				if not is_instance_valid(pickup) or not pickup.visible:
					continue
				var distance := actor.global_position.distance_to(pickup.global_position)
				if distance < pickup_distance:
					nearest_pickup = pickup
					pickup_distance = distance
		if nearest_pickup:
			goal = nearest_pickup.global_position
			chasing_pickup = true
		else:
			var angle := float(actor.peer_id % 20) * TAU / 20.0
			goal = Vector3(cos(angle) * 30.0, 0.0, sin(angle) * 30.0)
	var direction := goal - actor.global_position
	direction.y = 0.0
	var distance_to_goal := direction.length()
	if distance_to_goal > 0.05:
		controls["yaw"] = atan2(-direction.x, -direction.z)
	var stop_distance := 2.45 if chasing_enemy else 2.2
	if distance_to_goal > stop_distance:
		controls["move"] = Vector2(0.0, -1.0)
		controls["sprint"] = distance_to_goal > 8.0 and actor.stamina > 10.0
	if chasing_enemy and enemy_distance < 2.8:
		controls["attack"] = true
	if chasing_pickup and distance_to_goal < 3.0:
		controls["interact"] = true
	var grenade_timer := maxf(0.0, float(bot_grenade_timers.get(actor.peer_id, 0.0)) - delta)
	if chasing_enemy and enemy_distance > 5.0 and enemy_distance < 9.0 and actor.grenades > 0 and grenade_timer <= 0.0:
		Session.grenade_requested.emit(actor.peer_id)
		grenade_timer = 2.2
	bot_grenade_timers[actor.peer_id] = grenade_timer
	return controls
func _process(delta: float) -> void:
	_hud_timer += delta
	if _hud_timer > 0.12:
		_hud_timer = 0.0
		_update_interface()
		_refresh_hud()
	if not Session.is_host:
		for index in range(grenades_live.size() - 1, -1, -1):
			var grenade: Dictionary = grenades_live[index]
			grenade["fuse"] = float(grenade["fuse"]) - delta
			grenade["velocity"] += Vector3.DOWN * 9.8 * delta
			grenade["position"] += grenade["velocity"] * delta
			var floor_y := island.terrain_height(grenade["position"].x, grenade["position"].z)
			if float(grenade["fuse"]) <= 0.0 or grenade["position"].y <= floor_y:
				if is_instance_valid(grenade.get("visual")):
					grenade["visual"].queue_free()
				grenades_live.remove_at(index)
	for grenade in grenades_live:
		if is_instance_valid(grenade.get("visual")):
			grenade["visual"].global_position = grenade["position"]

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and mouse_captured:
		var actor: PlayerAvatar = actors.get(Session.local_peer_id)
		if actor:
			actor.look_mouse(event.relative)
	if event is InputEventMouseButton and event.pressed and Session.phase in ["BUS", "MATCH"] and not inventory_open:
		if not mouse_captured:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
			mouse_captured = true
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_TAB and Session.phase in ["BUS", "MATCH"]:
			inventory_open = not inventory_open
			_inventory_panel.visible = inventory_open
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if inventory_open else Input.MOUSE_MODE_CAPTURED
			mouse_captured = not inventory_open
			_refresh_hud()
		elif event.keycode == KEY_ESCAPE and mouse_captured:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
			mouse_captured = false

func _sample_controls(actor: PlayerAvatar) -> Dictionary:
	var move := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var jump_pressed := Input.is_action_just_pressed("jump_or_climb")
	var grenade_pressed := Input.is_action_just_pressed("grenade")
	var interact_pressed := Input.is_action_just_pressed("interact")
	var attack_pressed := Input.is_action_pressed("attack")
	var dance_pressed := Input.is_action_just_pressed("dance")
	var controls := {
		"move": move, "yaw": actor.camera_yaw(), "jump": jump_pressed,
		"climb": Input.is_action_pressed("jump_or_climb"),
		"sprint": Input.is_action_pressed("sprint"), "attack": attack_pressed,
		"grenade": false, "interact": interact_pressed, "dance": dance_pressed
	}
	if grenade_pressed:
		Session.request_grenade_local()
	if interact_pressed and not Session.is_host:
		Session.request_interact_local()
	if dance_pressed and not Session.is_host:
		Session.request_dance_local()
	if dance_pressed and actor.peer_id == Session.local_peer_id:
		_show_toast("¡A bailar!")
	return controls

func _spawn_preview() -> void:
	var preview := AVATAR_SCRIPT.new() as PlayerAvatar
	preview.configure(0, "Gordito", island, true)
	preview.name = "PersonajeDePortada"
	add_child(preview)
	preview.position = Vector3(0.0, island.terrain_height(0.0, 10.0) + 0.12, 10.0)
	preview.rotation.y = PI
	actors[0] = preview

func _spawn_guardians() -> void:
	var data := [
		[-101, "La Cabra del Monte", Vector3(10.0, island.terrain_height(10.0, -31.0), -31.0), 2],
		[-102, "El Rey de la Calima", Vector3(-105.0, island.terrain_height(-105.0, -42.0), -42.0), 3],
		[-103, "Señora Marisma", Vector3(96.0, island.terrain_height(96.0, 92.0), 92.0), 4]
	]
	for entry in data:
		var guardian := AVATAR_SCRIPT.new() as PlayerAvatar
		guardian.configure(entry[0], entry[1], island, false)
		guardian.name = "Guardián_%s" % entry[0]
		guardian.sword_level = entry[3]
		guardian.health = 145.0
		guardian.max_stamina = 160.0
		guardian.scale = Vector3.ONE * 1.08
		add_child(guardian)
		guardian.global_position = entry[2] + Vector3(0, 0.1, 0)
		guardian.attack_triggered.connect(_on_attack_triggered.bind(entry[0]))
		guardians[entry[0]] = guardian
		guardian_spawn_positions[entry[0]] = entry[2]
		guardian_spawn_swords[entry[0]] = entry[3]

func _reset_round_world() -> void:
	_last_storm_tick = 0.0
	for grenade in grenades_live:
		if is_instance_valid(grenade.get("visual")):
			grenade["visual"].queue_free()
	grenades_live.clear()
	island.reset_round_world()
	for raw_id in guardians.keys():
		var guardian: PlayerAvatar = guardians[raw_id]
		guardian.global_position = guardian_spawn_positions[raw_id] + Vector3(0.0, 0.1, 0.0)
		guardian.velocity = Vector3.ZERO
		guardian.health = 145.0
		guardian.max_stamina = 160.0
		guardian.stamina = guardian.max_stamina
		guardian.sword_level = int(guardian_spawn_swords[raw_id])
		guardian.alive = true
		guardian.show()
		guardian._last_animation = ""
		guardian._play_animation("Idle_Loop")

func _sync_player_nodes() -> void:
	if Session.phase != "HOME" and actors.has(0):
		var preview: Node = actors[0]
		if is_instance_valid(preview):
			preview.queue_free()
		actors.erase(0)
	for raw_id in Session.players.keys():
		var id := int(raw_id)
		var data: Dictionary = Session.players[raw_id]
		var spawn_x := float((id % 5) - 2) * 2.1
		var spawn_z := 12.0 + float(id % 4) * 2.0
		var spawn_position := Vector3(spawn_x, island.terrain_height(spawn_x, spawn_z) + 0.12, spawn_z)
		var initial_position: Vector3 = data.get("position", Vector3.ZERO)
		if initial_position.length_squared() < 0.01:
			initial_position = spawn_position
			data["position"] = initial_position
			Session.players[raw_id]["position"] = initial_position
		var actor: PlayerAvatar = actors.get(id)
		if not actor or not is_instance_valid(actor):
			actor = AVATAR_SCRIPT.new() as PlayerAvatar
			actor.configure(id, str(data.get("name", "Gordito")), island, id == Session.local_peer_id)
			actor.name = "Pasajero_%d" % id
			actor.attack_triggered.connect(_on_attack_triggered.bind(id))
			add_child(actor)
			actors[id] = actor
			actor.rotation.y = PI
		actor.apply_network_state(data, false)
		if Session.phase in ["LOBBY", "CONNECTING", "COUNTDOWN"]:
			actor.global_position = initial_position
			actor.velocity = Vector3.ZERO
	for existing_id in actors.keys():
		if int(existing_id) != 0 and not Session.players.has(int(existing_id)) and not Session.players.has(str(existing_id)):
			actors[existing_id].queue_free()
			actors.erase(existing_id)
	for vehicle in island.vehicle_nodes:
		if vehicle is RideableVehicle and vehicle.occupant_id > 0 and not Session.players.has(vehicle.occupant_id) and not Session.players.has(str(vehicle.occupant_id)):
			vehicle.release()
	if Session.phase == "HOME" and not actors.has(0):
		_spawn_preview()
	_update_interface()
	if Session.is_host and Session.phase == "MATCH":
		_check_winner()

func _apply_snapshot(snapshot: Dictionary) -> void:
	var states: Dictionary = snapshot.get("players", {})
	for raw_id in states.keys():
		var id := int(raw_id)
		if actors.has(id):
			actors[id].apply_network_state(states[raw_id], true)
	var npc_data: Dictionary = snapshot.get("npcs", {})
	for raw_id in npc_data.keys():
		var id := int(raw_id)
		if guardians.has(id):
			guardians[id].apply_network_state(npc_data[raw_id], true)
	if snapshot.has("pickups"):
		island.apply_pickup_states(snapshot["pickups"])
	if not Session.is_host:
		var vehicle_data: Dictionary = snapshot.get("vehicles", {})
		for vehicle in island.vehicle_nodes:
			if vehicle is RideableVehicle and vehicle_data.has(vehicle.name):
				vehicle.apply_network_state(vehicle_data[vehicle.name], true)
	island.storm_radius = float(snapshot.get("storm_radius", island.storm_radius))
	if str(snapshot.get("phase", "")) == "END":
		_show_end_screen()

func _tick_guardians(delta: float) -> void:
	var targets: Array[PlayerAvatar] = []
	for key in Session.players.keys():
		var actor: PlayerAvatar = actors.get(int(key))
		if actor and actor.alive:
			targets.append(actor)
	if targets.is_empty():
		return
	for id in guardians.keys():
		var guardian: PlayerAvatar = guardians[id]
		if not guardian.alive:
			continue
		var target := targets[0]
		for candidate in targets:
			if guardian.global_position.distance_squared_to(candidate.global_position) < guardian.global_position.distance_squared_to(target.global_position):
				target = candidate
		var delta_pos := target.global_position - guardian.global_position
		delta_pos.y = 0.0
		var close := delta_pos.length() < 2.8
		if delta_pos.length() > 0.01:
			guardian.rotation.y = atan2(-delta_pos.x, -delta_pos.z)
		var controls := {"move": Vector2(0.0, -1.0 if not close else 0.0), "yaw": guardian.rotation.y, "jump": false, "climb": false, "sprint": not close, "attack": close, "grenade": false, "interact": false, "dance": false}
		guardian.simulate(delta, controls, Session.phase, island.bus.global_position if island.bus else Vector3(0,160,0))
		Session.npc_states[str(id)] = guardian.network_state()

func _tick_grenades(delta: float) -> void:
	for index in range(grenades_live.size() - 1, -1, -1):
		var g: Dictionary = grenades_live[index]
		g["fuse"] = float(g["fuse"]) - delta
		g["velocity"] += Vector3.DOWN * 9.8 * delta
		g["position"] += g["velocity"] * delta
		var floor_y := island.terrain_height(g["position"].x, g["position"].z)
		if float(g["fuse"]) <= 0.0 or g["position"].y <= floor_y:
			_detonate(g)
			grenades_live.remove_at(index)

func _tick_storm(delta: float) -> void:
	if Session.round_clock - _last_storm_tick < 1.0:
		return
	_last_storm_tick = Session.round_clock
	for key in Session.players.keys():
		var actor: PlayerAvatar = actors.get(int(key))
		if not actor or not actor.alive:
			continue
		if Vector2(actor.global_position.x, actor.global_position.z).length() > island.storm_radius:
			actor.health -= 7.0
			if actor.health <= 0.0:
				_eliminate_actor(actor.peer_id)
			if Session.phase != "MATCH":
				return

func _on_attack_triggered(attacker_id: int) -> void:
	if not Session.is_host or Session.phase != "MATCH":
		return
	var attacker: PlayerAvatar = actors.get(attacker_id, guardians.get(attacker_id))
	if not attacker or not attacker.alive:
		return
	var forward := attacker.camera_forward()
	for target_id in actors.keys():
		var target: PlayerAvatar = actors[target_id]
		if target_id == attacker_id or not target.alive:
			continue
		if _is_in_sword_arc(attacker, target, forward):
			_damage_target(attacker, target)
	for enemy_id in guardians.keys():
		var enemy: PlayerAvatar = guardians[enemy_id]
		if enemy_id == attacker_id or not enemy.alive:
			continue
		if _is_in_sword_arc(attacker, enemy, forward):
			_damage_target(attacker, enemy)

func _is_in_sword_arc(attacker: PlayerAvatar, target: PlayerAvatar, forward: Vector3) -> bool:
	var delta := target.global_position - attacker.global_position
	delta.y = 0.0
	return delta.length() < 3.0 and delta.length() > 0.01 and forward.normalized().dot(delta.normalized()) > 0.18

func _damage_target(attacker: PlayerAvatar, target: PlayerAvatar, damage_override: float = -1.0) -> void:
	var damage := damage_override if damage_override >= 0.0 else 20.0 + attacker.sword_level * 6.0
	target.health = maxf(0.0, target.health - damage)
	if guardians.has(target.peer_id):
		Session.npc_states[str(target.peer_id)] = target.network_state()
	else:
		Session.update_authoritative_state(target.peer_id, target.network_state())
	if target.health > 0.0:
		return
	target.alive = false
	target.hide()
	attacker.kills += 1
	if guardians.has(target.peer_id):
		attacker.sword_level = maxi(attacker.sword_level, target.sword_level)
		if attacker.inventory.size() < 8:
			attacker.inventory.append("Espada de nivel %d" % target.sword_level)
		island.spawn_pickup("Espada nivel %d" % target.sword_level, target.global_position + Vector3(0, 0.4, 0))
		_show_toast("¡Guardián vencido! Espada nivel %d" % target.sword_level)
	elif Session.players.has(attacker.peer_id):
		_show_toast("¡Eliminación! %s suma otra baja." % attacker.player_name)
	Session.update_authoritative_state(attacker.peer_id, attacker.network_state())
	if guardians.has(target.peer_id):
		Session.npc_states[str(target.peer_id)] = target.network_state()
	else:
		Session.update_authoritative_state(target.peer_id, target.network_state())
	_check_winner()

func _on_grenade_requested(peer_id: int) -> void:
	if not Session.is_host or Session.phase != "MATCH":
		return
	var actor: PlayerAvatar = actors.get(peer_id)
	if actor and actor.alive and actor.throw_grenade():
		_spawn_grenade(actor)
		Session.update_authoritative_state(peer_id, actor.network_state())

func _make_grenade_visual(at: Vector3) -> MeshInstance3D:
	var visual := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = 0.22
	mesh.height = 0.44
	mesh.radial_segments = 12
	visual.mesh = mesh
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("7f9d3c")
	material.metallic = 0.15
	visual.material_override = material
	add_child(visual)
	visual.global_position = at
	return visual

func _spawn_grenade(actor: PlayerAvatar) -> void:
	if not Session.is_host:
		return
	var start := actor.global_position + Vector3(0, 1.5, 0) + actor.camera_forward() * 0.8
	var velocity := actor.camera_forward() * 15.5 + Vector3(0, 5.0, 0)
	var visual := _make_grenade_visual(start)
	grenades_live.append({"visual": visual, "position": start, "velocity": velocity, "owner": actor.peer_id, "fuse": 1.55})
	Session.broadcast_grenade_thrown(start, velocity)

func _on_grenade_thrown(position: Vector3, velocity: Vector3) -> void:
	if Session.is_host:
		return
	var visual := _make_grenade_visual(position)
	grenades_live.append({"visual": visual, "position": position, "velocity": velocity, "owner": -1, "fuse": 1.55})

func _detonate(grenade: Dictionary) -> void:
	var position: Vector3 = grenade["position"]
	var owner_id := int(grenade.get("owner", -1))
	Session.broadcast_grenade_detonation(position)
	_show_grenade_flash(position)
	for raw_id in actors.keys():
		var target: PlayerAvatar = actors[raw_id]
		if target.alive and target.peer_id > 0 and target.global_position.distance_to(position) < 5.0:
			target.health = maxf(0.0, target.health - 45.0)
			Session.update_authoritative_state(target.peer_id, target.network_state())
			if target.health <= 0.0:
				_eliminate_actor(target.peer_id, owner_id)
	for raw_id in guardians.keys():
		var target: PlayerAvatar = guardians[raw_id]
		if not target.alive or target.global_position.distance_to(position) >= 5.0:
			continue
		target.health = maxf(0.0, target.health - 55.0)
		var owner: PlayerAvatar = actors.get(owner_id)
		if target.health <= 0.0 and owner:
			_damage_target(owner, target, 0.0)
		else:
			Session.npc_states[str(target.peer_id)] = target.network_state()
	if is_instance_valid(grenade.get("visual")):
		grenade["visual"].queue_free()

func _on_grenade_detonated(position: Vector3) -> void:
	if not Session.is_host:
		var nearest_index := -1
		var nearest_distance := 8.0
		for index in grenades_live.size():
			var grenade: Dictionary = grenades_live[index]
			var distance: float = grenade["position"].distance_to(position)
			if distance < nearest_distance:
				nearest_distance = distance
				nearest_index = index
		if nearest_index >= 0:
			var predicted: Dictionary = grenades_live[nearest_index]
			if is_instance_valid(predicted.get("visual")):
				predicted["visual"].queue_free()
			grenades_live.remove_at(nearest_index)
	_show_grenade_flash(position)

func _show_grenade_flash(position: Vector3) -> void:
	var flash := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 4.2
	sphere.height = 8.4
	flash.mesh = sphere
	flash.position = position
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.55, 0.79, 0.19, 0.66)
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.emission_enabled = true
	material.emission = Color("76a82d")
	flash.material_override = material
	add_child(flash)
	var tween := create_tween()
	tween.tween_property(flash, "scale", Vector3(1.55, 1.55, 1.55), 0.45)
	tween.tween_callback(flash.queue_free)

func _eliminate_actor(peer_id: int, killer_peer_id: int = -1) -> void:
	var actor: PlayerAvatar = actors.get(peer_id)
	if not actor or not actor.alive:
		return
	actor.alive = false
	actor.hide()
	Session.update_authoritative_state(peer_id, actor.network_state())
	if killer_peer_id > 0 and killer_peer_id != peer_id:
		var killer: PlayerAvatar = actors.get(killer_peer_id)
		if killer and killer.alive:
			killer.kills += 1
			Session.update_authoritative_state(killer_peer_id, killer.network_state())
			_show_toast("¡Eliminación con granada! %s suma otra baja." % killer.player_name)
	_check_winner()

func _check_winner() -> void:
	if not Session.is_host:
		return
	var survivors: Array[String] = []
	for data in Session.players.values():
		if data.get("alive", true):
			survivors.append(str(data.get("name", "Gordito")))
	if Session.players.size() > 1 and survivors.size() <= 1:
		Session.finish_round(survivors[0] if not survivors.is_empty() else "Nadie")

func _build_interface() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 20
	add_child(layer)
	var root := Control.new()
	root.name = "Interface"
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.add_child(root)
	var backdrop := ColorRect.new()
	backdrop.name = "AtmosphereShade"
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	backdrop.color = Color(0.035, 0.075, 0.09, 0.26)
	backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(backdrop)
	_home_panel = _make_card(root, Vector2(20, 0), Vector2(520, 700), Vector2(0.0, 0.5))
	_build_home_contents(_home_panel)
	_lobby_panel = _make_card(root, Vector2(0, 0), Vector2(560, 680), Vector2(0.5, 0.5))
	_build_lobby_contents(_lobby_panel)
	_hud = _build_hud(root)
	_inventory_panel = _make_card(root, Vector2(0, 0), Vector2(610, 570), Vector2(0.5, 0.5))
	_build_inventory_contents(_inventory_panel)
	_end_panel = _make_card(root, Vector2(0, 0), Vector2(650, 470), Vector2(0.5, 0.5))
	_build_end_contents(_end_panel)
	_toast = Label.new()
	_toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_toast.add_theme_font_size_override("font_size", 18)
	_toast.add_theme_color_override("font_color", Color("fff0cf"))
	_toast.anchor_left = 0.5
	_toast.anchor_right = 0.5
	_toast.anchor_top = 0.08
	_toast.offset_left = -320
	_toast.offset_right = 320
	root.add_child(_toast)

func _make_card(parent: Control, position: Vector2, size: Vector2, anchor: Vector2) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.anchor_left = anchor.x
	panel.anchor_right = anchor.x
	panel.anchor_top = anchor.y
	panel.anchor_bottom = anchor.y
	panel.offset_left = position.x - size.x * anchor.x
	panel.offset_right = position.x + size.x * (1.0 - anchor.x)
	panel.offset_top = position.y - size.y * anchor.y
	panel.offset_bottom = position.y + size.y * (1.0 - anchor.y)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.06, 0.11, 0.13, 0.96)
	style.border_color = Color("e3bd77")
	style.set_border_width_all(1)
	style.set_corner_radius_all(12)
	style.content_margin_left = 30
	style.content_margin_right = 30
	style.content_margin_top = 26
	style.content_margin_bottom = 24
	panel.add_theme_stylebox_override("panel", style)
	parent.add_child(panel)
	return panel

func _build_home_contents(panel: Control) -> void:
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 14)
	panel.add_child(column)
	var eyebrow := _label("TEMPORADA 01  •  RUTA AL PLATO", 12, Color("e9bd72"))
	column.add_child(eyebrow)
	var title := _label("GORDO\nROYALE", 56, Color("fff2da"))
	title.add_theme_font_size_override("font_size", 56)
	column.add_child(title)
	var sub := _label("EL ÚLTIMO EN PIE SE QUEDA CON EL KEBAB", 13, Color("b9d1ca"))
	column.add_child(sub)
	var line := HSeparator.new()
	column.add_child(line)
	column.add_child(_label("ELIGE TU NOMBRE DE BATALLA", 11, Color("b9d1ca")))
	_name_field = LineEdit.new()
	_name_field.text = "Gordito"
	_name_field.placeholder_text = "Tu nombre"
	_name_field.custom_minimum_size.y = 44
	_style_input(_name_field)
	column.add_child(_name_field)
	_host_button = _button("CREAR PARTIDA  ·  SOY ANFITRIÓN", Color("d75c43"))
	_host_button.pressed.connect(_on_host_pressed)
	column.add_child(_host_button)
	var solo_button := _button("JUGAR EN SOLITARIO · 19 BOTS", Color("4d9c91"))
	solo_button.pressed.connect(_start_solo_bots)
	column.add_child(solo_button)
	column.add_child(_label("O ÚNETE A TU AMIGO", 11, Color("b9d1ca")))
	var join_row := HBoxContainer.new()
	join_row.add_theme_constant_override("separation", 8)
	_address_field = LineEdit.new()
	_address_field.text = "127.0.0.1"
	_address_field.placeholder_text = "IP del anfitrión"
	_address_field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_address_field.custom_minimum_size.y = 42
	_style_input(_address_field)
	join_row.add_child(_address_field)
	_join_button = _button("UNIRSE", Color("4d9c91"))
	_join_button.custom_minimum_size.x = 118
	_join_button.pressed.connect(_on_join_pressed)
	join_row.add_child(_join_button)
	column.add_child(join_row)
	var note := _label("WASD mover · SHIFT correr · ESPACIO saltar/escalar\nTAB mochila · G baile · Q granada · E interactuar", 11, Color("94aba5"))
	column.add_child(note)

func _build_lobby_contents(panel: Control) -> void:
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 13)
	panel.add_child(column)
	column.add_child(_label("VUELO CHÁRTER  •  SALA PRIVADA", 12, Color("e9bd72")))
	column.add_child(_label("PASAJEROS", 38, Color("fff2da")))
	_lobby_count = _label("1 / 20 JUGADORES", 14, Color("9dc4b7"))
	column.add_child(_lobby_count)
	_lobby_status = _label("Esperando a los pasajeros…", 13, Color("d8ddd1"))
	column.add_child(_lobby_status)
	_invite_label = _label("DIRECCIÓN LOCAL: —", 12, Color("f0c478"))
	_invite_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(_invite_label)
	_player_list = VBoxContainer.new()
	_player_list.add_theme_constant_override("separation", 7)
	column.add_child(_player_list)
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 9)
	_ready_button = _button("MARCAR LISTO", Color("4d9c91"))
	_ready_button.pressed.connect(_on_ready_pressed)
	actions.add_child(_ready_button)
	_start_button = _button("DESPEGAR  →", Color("d75c43"))
	_start_button.pressed.connect(_on_start_pressed)
	actions.add_child(_start_button)
	column.add_child(actions)
	_bots_button = _button("LLENAR SALA HASTA 20 CON BOTS", Color("d49b4d"))
	_bots_button.pressed.connect(_on_bots_pressed)
	column.add_child(_bots_button)
	column.add_child(_label("2–20 pasajeros  ·  host por UDP 7777\nAl empezar, el autobús cruza la isla y cada cual salta cuando quiera.", 11, Color("94aba5")))

func _build_hud(parent: Control) -> Control:
	var hud := Control.new()
	hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	parent.add_child(hud)
	var top := PanelContainer.new()
	top.anchor_left = 0.5
	top.anchor_right = 0.5
	top.offset_left = -180
	top.offset_right = 180
	top.offset_top = 18
	top.offset_bottom = 70
	var top_style := StyleBoxFlat.new()
	top_style.bg_color = Color(0.05, 0.1, 0.12, 0.82)
	top_style.set_corner_radius_all(8)
	top.add_theme_stylebox_override("panel", top_style)
	hud.add_child(top)
	_timer_label = _label("AUTOBÚS EN RUTA", 16, Color("fff0d2"))
	_timer_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	top.add_child(_timer_label)
	var bottom := PanelContainer.new()
	bottom.anchor_left = 0.0
	bottom.anchor_right = 0.0
	bottom.anchor_top = 1.0
	bottom.anchor_bottom = 1.0
	bottom.offset_left = 22
	bottom.offset_right = 350
	bottom.offset_top = -138
	bottom.offset_bottom = -22
	var bottom_style := StyleBoxFlat.new()
	bottom_style.bg_color = Color(0.05, 0.1, 0.12, 0.83)
	bottom_style.set_corner_radius_all(8)
	bottom.add_theme_stylebox_override("panel", bottom_style)
	hud.add_child(bottom)
	var stats := VBoxContainer.new()
	stats.add_theme_constant_override("separation", 4)
	bottom.add_child(stats)
	var hp_title := _label("SALUD", 10, Color("f2c7a4"))
	stats.add_child(hp_title)
	_health_bar = _progress(Color("d8644b"))
	stats.add_child(_health_bar)
	var stamina_title := _label("RESISTENCIA", 10, Color("b8e2c2"))
	stats.add_child(stamina_title)
	_stamina_bar = _progress(Color("74bd8a"))
	stats.add_child(_stamina_bar)
	var gear_row := HBoxContainer.new()
	_gear_label = _label("AGARRE I", 12, Color("f1d08c"))
	_sword_label = _label("ESPADA I", 12, Color("d4dde4"))
	_grenade_label = _label("CACA ×2", 12, Color("bdd787"))
	gear_row.add_child(_gear_label)
	gear_row.add_child(_sword_label)
	gear_row.add_child(_grenade_label)
	stats.add_child(gear_row)
	_storm_label = _label("TORMENTA 170 m", 13, Color("ffda8a"))
	_storm_label.anchor_left = 1.0
	_storm_label.anchor_right = 1.0
	_storm_label.anchor_top = 0.12
	_storm_label.anchor_bottom = 0.12
	_storm_label.offset_left = -260
	_storm_label.offset_right = -30
	_storm_label.offset_top = 0
	_storm_label.offset_bottom = 28
	hud.add_child(_storm_label)
	var help := _label("WASD mover  ·  SHIFT correr  ·  ESPACIO saltar/escalar  ·  E usar\nTAB inventario  ·  G baile  ·  Q granada  ·  CLIC espada", 12, Color("fff1d7"))
	help.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	help.anchor_left = 0.5
	help.anchor_right = 0.5
	help.anchor_top = 1.0
	help.anchor_bottom = 1.0
	help.offset_left = -390
	help.offset_right = 390
	help.offset_top = -67
	help.offset_bottom = -18
	hud.add_child(help)
	return hud

func _build_inventory_contents(panel: Control) -> void:
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	panel.add_child(column)
	column.add_child(_label("MOCHILA  ·  TAB PARA CERRAR", 12, Color("e9bd72")))
	column.add_child(_label("EQUIPO DE EXPEDICIÓN", 31, Color("fff2da")))
	_inventory_status = _label("Huecos: 4 / 8", 13, Color("9dc4b7"))
	column.add_child(_inventory_status)
	_inventory_list = VBoxContainer.new()
	_inventory_list.add_theme_constant_override("separation", 7)
	column.add_child(_inventory_list)
	column.add_child(_label("Las piezas de agarre elevan el límite de escalada y aumentan tu resistencia.", 11, Color("94aba5")))

func _build_end_contents(panel: Control) -> void:
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	panel.add_child(column)
	column.add_child(_label("TEMPORADA 01  •  FIN DEL VUELO", 12, Color("e9bd72")))
	column.add_child(_label("ÚLTIMA CROQUETA", 34, Color("fff2da")))
	_winner_label = _label("Gana…", 23, Color("f1cd80"))
	column.add_child(_winner_label)
	var back := _button("VOLVER AL LOBBY", Color("4d9c91"))
	back.pressed.connect(func(): Session.close_connection(); _show_home())
	column.add_child(back)

func _start_solo_bots() -> void:
	Session.solo_game(_name_field.text)
	Session.fill_lobby_with_bots()
	Session.start_round()
	print("Partida en solitario iniciada: %d jugadores, fase %s" % [Session.players.size(), Session.phase])

func _on_host_pressed() -> void:
	var error := Session.host_game(_name_field.text)
	if error != OK:
		_show_toast("No se pudo abrir UDP 7777. Error %d" % error)
		return
	_show_toast("Sala creada. Comparte tu dirección local.")
	_sync_player_nodes()

func _on_join_pressed() -> void:
	var error := Session.join_game(_address_field.text, _name_field.text)
	if error != OK:
		_show_toast("No se pudo conectar. Revisa la IP y el puerto 7777.")
		return
	_home_panel.visible = false
	_lobby_panel.visible = true
	_lobby_status.text = "Conectando con el anfitrión…"

func _on_ready_pressed() -> void:
	if not Session.players.has(Session.local_peer_id):
		return
	var now_ready := not bool(Session.players[Session.local_peer_id].get("ready", false))
	Session.set_local_ready(now_ready)

func _on_start_pressed() -> void:
	Session.start_round()

func _on_bots_pressed() -> void:
	if Session.bot_count() > 0:
		Session.remove_lobby_bots()
	else:
		Session.fill_lobby_with_bots()

func _on_phase_changed(phase_name: String) -> void:
	if phase_name == "LOBBY":
		_reset_round_world()
	if phase_name == "HOME":
		_show_home()
	elif phase_name in ["LOBBY", "CONNECTING"]:
		_home_panel.visible = phase_name == "CONNECTING"
		_lobby_panel.visible = phase_name == "LOBBY"
		_hud.visible = false
		_end_panel.visible = false
	elif phase_name in ["COUNTDOWN", "BUS", "MATCH"]:
		_home_panel.visible = false
		_lobby_panel.visible = false
		_hud.visible = phase_name == "MATCH"
		_end_panel.visible = false
		if phase_name == "MATCH":
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
			mouse_captured = true
	elif phase_name == "END":
		_show_end_screen()
	_update_interface()

func _update_interface() -> void:
	if not is_instance_valid(_home_panel):
		return
	var is_lobby := Session.phase in ["LOBBY", "CONNECTING"]
	if Session.phase == "HOME":
		_show_home()
		return
	_home_panel.visible = Session.phase == "CONNECTING"
	_lobby_panel.visible = is_lobby and Session.phase == "LOBBY"
	_hud.visible = Session.phase in ["BUS", "MATCH"]
	_inventory_panel.visible = inventory_open
	_lobby_count.text = "%d / 20 JUGADORES" % Session.players.size()
	_invite_label.text = "DIRECCIÓN LOCAL: %s : 7777" % Session.lan_address() if Session.is_host else "ANFITRIÓN: %s : 7777" % _address_field.text
	_ready_button.visible = is_lobby and Session.phase == "LOBBY"
	_start_button.visible = Session.is_host and Session.phase == "LOBBY"
	_start_button.disabled = Session.players.size() < 2
	_bots_button.visible = Session.is_host and Session.phase == "LOBBY"
	_bots_button.disabled = Session.players.size() >= Session.MAX_PLAYERS and Session.bot_count() == 0
	_bots_button.text = "QUITAR %d BOTS" % Session.bot_count() if Session.bot_count() > 0 else "LLENAR SALA HASTA 20 CON BOTS"
	_ready_button.text = "LISTO ✓" if Session.players.has(Session.local_peer_id) and Session.players[Session.local_peer_id].get("ready", false) else "MARCAR LISTO"
	_lobby_status.text = "Todos listos. El anfitrión puede iniciar." if _all_ready() else "Esperando a que todos marquen LISTO…"
	if Session.bot_count() > 0 and not _all_ready():
		_lobby_status.text = "%d bots listos. Marca LISTO y despega." % Session.bot_count()
	if Session.phase == "COUNTDOWN":
		_lobby_panel.visible = true
		_lobby_status.text = "¡Despegue en %d!" % ceili(Session.countdown)
		_lobby_count.text = "%d PASAJEROS A BORDO" % Session.players.size()
	elif Session.phase == "BUS":
		_timer_label.text = "PULSA ESPACIO PARA SALTAR  ·  %d s" % ceili(maxf(0.0, 18.0 - Session.round_clock))
	elif Session.phase == "MATCH":
		_timer_label.text = "%02d:%02d  ·  %d SUPERVIVIENTES" % [int(Session.round_clock) / 60, int(Session.round_clock) % 60, _survivors()]
	for child in _player_list.get_children():
		child.queue_free()
	var visible_humans := 0
	var total_humans := 0
	for data in Session.players.values():
		if data.get("is_bot", false):
			continue
		total_humans += 1
		if visible_humans >= 4:
			continue
		visible_humans += 1
		var row := _label("●  %s     %s" % [data.get("name", "Gordito"), "LISTO" if data.get("ready", false) else "PREPARÁNDOSE"], 15, Color("d6e3d8"))
		_player_list.add_child(row)
	if total_humans > visible_humans:
		_player_list.add_child(_label("+ %d jugadores" % (total_humans - visible_humans), 13, Color("b9d1ca")))
	if Session.bot_count() > 0:
		_player_list.add_child(_label("%d BOTS  ·  LISTOS" % Session.bot_count(), 14, Color("f0c478")))
	_refresh_inventory()

func _all_ready() -> bool:
	if Session.players.is_empty():
		return false
	for data in Session.players.values():
		if not data.get("ready", false):
			return false
	return true

func _survivors() -> int:
	var count := 0
	for data in Session.players.values():
		if data.get("alive", true):
			count += 1
	return count

func _refresh_hud() -> void:
	if not is_instance_valid(_health_bar):
		return
	var actor: PlayerAvatar = actors.get(Session.local_peer_id)
	if not actor:
		return
	_health_bar.value = actor.health
	_stamina_bar.max_value = actor.max_stamina
	_stamina_bar.value = actor.stamina
	_gear_label.text = "AGARRE %s" % _roman(actor.climb_gear)
	_sword_label.text = "ESPADA %s" % _roman(actor.sword_level)
	_grenade_label.text = "CACA ×%d" % actor.grenades
	_storm_label.text = "TORMENTA  %.0f m" % island.storm_radius

func _refresh_inventory() -> void:
	if not _inventory_list or not is_instance_valid(_inventory_list):
		return
	for child in _inventory_list.get_children():
		child.queue_free()
	var actor: PlayerAvatar = actors.get(Session.local_peer_id)
	if not actor:
		return
	_inventory_status.text = "Huecos: %d / 8  ·  agarre %s" % [actor.inventory.size(), _roman(actor.climb_gear)]
	for index in 8:
		var text := "— vacío —"
		if index < actor.inventory.size():
			text = "%02d   %s" % [index + 1, actor.inventory[index]]
		_inventory_list.add_child(_label(text, 16 if index < actor.inventory.size() else 13, Color("f1dfbe") if index < actor.inventory.size() else Color("71847d")))

func _show_home() -> void:
	_home_panel.visible = true
	_lobby_panel.visible = false
	_hud.visible = false
	_inventory_panel.visible = false
	_end_panel.visible = false
	inventory_open = false
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	mouse_captured = false

func _show_end_screen() -> void:
	_end_panel.visible = true
	_hud.visible = false
	_lobby_panel.visible = false
	_home_panel.visible = false
	_inventory_panel.visible = false
	var winner := "Todos eliminados"
	for data in Session.players.values():
		if data.get("alive", false):
			winner = "%s gana" % data.get("name", "Gordito")
	_winner_label.text = winner
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	mouse_captured = false

func _show_toast(text: String) -> void:
	if _toast:
		_toast.text = text
		_toast.modulate.a = 1.0
		var tween := create_tween()
		tween.tween_interval(2.4)
		tween.tween_property(_toast, "modulate:a", 0.0, 0.5)

func _roman(value: int) -> String:
	return ["0", "I", "II", "III", "IV", "V"][clampi(value, 0, 5)]

func _label(text: String, size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label

func _button(text: String, color: Color) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size.y = 48
	button.add_theme_font_size_override("font_size", 14)
	button.add_theme_color_override("font_color", Color("fff4dd"))
	var normal := StyleBoxFlat.new()
	normal.bg_color = color
	normal.set_corner_radius_all(7)
	normal.content_margin_left = 14
	normal.content_margin_right = 14
	var hover := normal.duplicate()
	hover.bg_color = color.lightened(0.14)
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", hover)
	return button

func _style_input(input: LineEdit) -> void:
	input.add_theme_color_override("font_color", Color("fff0d5"))
	input.add_theme_color_override("font_placeholder_color", Color("96aaa4"))
	var style := StyleBoxFlat.new()
	style.bg_color = Color("10252b")
	style.border_color = Color("486b6a")
	style.set_border_width_all(1)
	style.set_corner_radius_all(6)
	style.content_margin_left = 10
	input.add_theme_stylebox_override("normal", style)
	input.add_theme_stylebox_override("focus", style)

func _progress(color: Color) -> ProgressBar:
	var bar := ProgressBar.new()
	bar.max_value = 100
	bar.value = 100
	bar.show_percentage = false
	bar.custom_minimum_size.y = 13
	var background := StyleBoxFlat.new()
	background.bg_color = Color("23383b")
	background.set_corner_radius_all(6)
	var fill := StyleBoxFlat.new()
	fill.bg_color = color
	fill.set_corner_radius_all(6)
	bar.add_theme_stylebox_override("background", background)
	bar.add_theme_stylebox_override("fill", fill)
	return bar

