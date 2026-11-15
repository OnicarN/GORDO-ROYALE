extends Node

signal room_changed
signal snapshot_received(states: Dictionary)
signal phase_changed(phase_name: String)
signal notice(text: String)
signal input_updated(peer_id: int, controls: Dictionary)
signal grenade_requested(peer_id: int)
signal grenade_detonated(position: Vector3)
signal grenade_thrown(position: Vector3, velocity: Vector3)

const PORT := 7777
const MAX_PLAYERS := 20
const SNAPSHOT_STEP := 0.05

var phase := "HOME"
var is_host := false
var local_peer_id := 1
var local_name := "Gordito"
var players: Dictionary = {}
var npc_states: Dictionary = {}
var vehicle_states: Dictionary = {}
var pickup_states: Dictionary = {}
var inputs: Dictionary = {}
var pending_jumps: Dictionary = {}
var pending_interactions: Dictionary = {}
var pending_dances: Dictionary = {}
var countdown := 0.0
var round_clock := 0.0
var _snapshot_accumulator := 0.0

func _ready() -> void:
	multiplayer.peer_connected.connect(_on_peer_connected)
	multiplayer.peer_disconnected.connect(_on_peer_disconnected)
	multiplayer.connected_to_server.connect(_on_connected_to_server)
	multiplayer.connection_failed.connect(_on_connection_failed)
	multiplayer.server_disconnected.connect(_on_server_disconnected)
	_define_input("move_forward", [KEY_W, KEY_UP])
	_define_input("move_back", [KEY_S, KEY_DOWN])
	_define_input("move_left", [KEY_A, KEY_LEFT])
	_define_input("move_right", [KEY_D, KEY_RIGHT])
	_define_input("jump_or_climb", [KEY_SPACE])
	_define_input("sprint", [KEY_SHIFT])
	_define_input("interact", [KEY_E])
	_define_input("inventory", [KEY_TAB])
	_define_input("dance", [KEY_G])
	_define_input("grenade", [KEY_Q])
	_define_input("attack", [])

func _define_input(action: String, keys: Array) -> void:
	if InputMap.has_action(action):
		return
	InputMap.add_action(action)
	for keycode in keys:
		var event := InputEventKey.new()
		event.physical_keycode = keycode
		InputMap.action_add_event(action, event)
	if action == "attack":
		var mouse_event := InputEventMouseButton.new()
		mouse_event.button_index = MOUSE_BUTTON_LEFT
		InputMap.action_add_event(action, mouse_event)

func solo_game(display_name: String) -> void:
	close_connection()
	local_name = _clean_name(display_name)
	is_host = true
	local_peer_id = 1
	players[local_peer_id] = _new_player(local_name)
	inputs[local_peer_id] = _empty_input()
	phase = "LOBBY"
	countdown = 0.0
	round_clock = 0.0
	room_changed.emit()
	phase_changed.emit(phase)

func host_game(display_name: String) -> Error:
	close_connection()
	local_name = _clean_name(display_name)
	var peer := ENetMultiplayerPeer.new()
	var result := peer.create_server(PORT, MAX_PLAYERS - 1)
	if result != OK:
		return result
	multiplayer.multiplayer_peer = peer
	is_host = true
	local_peer_id = 1
	players.clear()
	inputs.clear()
	pending_jumps.clear()
	players[1] = _new_player(local_name)
	inputs[1] = _empty_input()
	phase = "LOBBY"
	countdown = 0.0
	round_clock = 0.0
	room_changed.emit()
	phase_changed.emit(phase)
	return OK

func join_game(address: String, display_name: String) -> Error:
	close_connection()
	local_name = _clean_name(display_name)
	var target_address := address.strip_edges().replace(" ", "")
	var port_suffix := ":%d" % PORT
	if target_address.ends_with(port_suffix):
		target_address = target_address.left(target_address.length() - port_suffix.length())
	var peer := ENetMultiplayerPeer.new()
	var result := peer.create_client(target_address, PORT)
	if result != OK:
		return result
	multiplayer.multiplayer_peer = peer
	is_host = false
	phase = "CONNECTING"
	phase_changed.emit(phase)
	return OK

func close_connection() -> void:
	var had_room := multiplayer.multiplayer_peer != null or not players.is_empty() or phase != "HOME"
	if multiplayer.multiplayer_peer != null:
		multiplayer.multiplayer_peer.close()
		multiplayer.multiplayer_peer = null
	is_host = false
	local_peer_id = 1
	players.clear()
	inputs.clear()
	pending_jumps.clear()
	pending_interactions.clear()
	pending_dances.clear()
	npc_states.clear()
	vehicle_states.clear()
	pickup_states.clear()
	phase = "HOME"
	countdown = 0.0
	round_clock = 0.0
	_snapshot_accumulator = 0.0
	if had_room:
		room_changed.emit()

func _new_player(display_name: String, is_bot: bool = false) -> Dictionary:
	return {
		"name": display_name, "ready": is_bot, "is_bot": is_bot, "air_state": "LOBBY",
		"position": Vector3.ZERO, "yaw": 0.0, "aim_yaw": 0.0, "health": 100.0, "stamina": 100.0, "max_stamina": 100.0,
		"climb_gear": 1, "sword": 1, "grenades": 2, "kills": 0, "alive": true, "vehicle": "",
		"inventory": ["Guantes de escalada I", "Espada de chorizo", "Granada de caca ×2"]
	}

func bot_count() -> int:
	var count := 0
	for player in players.values():
		if player.get("is_bot", false):
			count += 1
	return count

func fill_lobby_with_bots() -> void:
	if not is_host or phase != "LOBBY":
		return
	var slot := 1
	while players.size() < MAX_PLAYERS:
		var bot_id := 1000 + slot
		slot += 1
		if players.has(bot_id):
			continue
		var bot := _new_player("Bot %02d" % (slot - 1), true)
		players[bot_id] = bot
		inputs[bot_id] = _empty_input()
	if players.has(local_peer_id):
		players[local_peer_id]["ready"] = true
	_broadcast_room()
	notice.emit("Sala completada con %d bots. ¡A despegar!" % bot_count())

func remove_lobby_bots() -> void:
	if not is_host or phase != "LOBBY":
		return
	for peer_id in players.keys():
		if players[peer_id].get("is_bot", false):
			players.erase(peer_id)
			inputs.erase(peer_id)
	_broadcast_room()
	notice.emit("Bots retirados de la sala.")

func _empty_input() -> Dictionary:
	return {"move": Vector2.ZERO, "yaw": 0.0, "jump": false, "sprint": false, "climb": false, "attack": false, "grenade": false, "interact": false, "dance": false}

func _clean_name(value: String) -> String:
	var result := value.strip_edges().replace("<", "").replace(">", "").replace("\n", "").left(18)
	return result if not result.is_empty() else "Gordito"

func _on_peer_connected(_peer_id: int) -> void:
	if is_host:
		notice.emit("Jugador conectando…")

func _on_peer_disconnected(peer_id: int) -> void:
	if not is_host:
		return
	players.erase(peer_id)
	inputs.erase(peer_id)
	pending_jumps.erase(peer_id)
	_broadcast_room()
	notice.emit("Un jugador ha salido de la sala.")

func _on_connected_to_server() -> void:
	local_peer_id = multiplayer.get_unique_id()
	rpc_id(1, "request_join", local_name)

func _on_connection_failed() -> void:
	close_connection()
	phase_changed.emit("HOME")
	notice.emit("No se pudo conectar. Revisa la IP y el puerto UDP 7777.")

func _on_server_disconnected() -> void:
	close_connection()
	notice.emit("El anfitrión ha cerrado la partida.")
	phase_changed.emit(phase)

@rpc("any_peer", "call_remote", "reliable")
func request_join(display_name: String) -> void:
	if not is_host:
		return
	var sender := multiplayer.get_remote_sender_id()
	if phase != "LOBBY" or players.size() >= MAX_PLAYERS:
		rpc_id(sender, "join_rejected", "La sala está en marcha o llena.")
		return
	players[sender] = _new_player(_clean_name(display_name))
	inputs[sender] = _empty_input()
	_broadcast_room()
	notice.emit("%s se ha unido." % players[sender]["name"])

@rpc("authority", "call_remote", "reliable")
func join_rejected(reason: String) -> void:
	notice.emit(reason)
	close_connection()
	phase_changed.emit("HOME")

func set_local_ready(value: bool) -> void:
	if phase != "LOBBY":
		return
	if is_host:
		players[local_peer_id]["ready"] = value
		_broadcast_room()
	else:
		rpc_id(1, "receive_ready_request", value)

@rpc("any_peer", "call_remote", "reliable")
func receive_ready_request(value: bool) -> void:
	if not is_host or phase != "LOBBY":
		return
	var sender := multiplayer.get_remote_sender_id()
	if players.has(sender):
		players[sender]["ready"] = value
		_broadcast_room()

func start_round() -> void:
	if not is_host or phase != "LOBBY":
		return
	if players.size() < 2:
		notice.emit("Invita al menos a otra persona para empezar.")
		return
	for player in players.values():
		if not player["ready"]:
			notice.emit("Todos tienen que marcar LISTO antes de despegar.")
			return
	phase = "COUNTDOWN"
	countdown = 7.0
	round_clock = 0.0
	for player in players.values():
		player["air_state"] = "BUS"
		player["alive"] = true
		player["health"] = 100.0
	_broadcast_room()
	phase_changed.emit(phase)

func request_drop_local() -> void:
	if phase != "BUS":
		return
	if is_host:
		_set_dropped(local_peer_id)
	else:
		rpc_id(1, "request_drop")

@rpc("any_peer", "call_remote", "reliable")
func request_drop() -> void:
	if is_host and phase == "BUS":
		_set_dropped(multiplayer.get_remote_sender_id())

func _set_dropped(peer_id: int) -> void:
	if players.has(peer_id) and players[peer_id]["air_state"] == "BUS":
		players[peer_id]["air_state"] = "FALL"
		_broadcast_room()


func request_jump_local() -> void:
	if phase != "MATCH":
		return
	if is_host:
		pending_jumps[local_peer_id] = true
	else:
		rpc_id(1, "receive_jump_request")

@rpc("any_peer", "call_remote", "reliable")
func receive_jump_request() -> void:
	if not is_host or phase != "MATCH":
		return
	var sender := multiplayer.get_remote_sender_id()
	if players.has(sender) and players[sender].get("alive", true):
		pending_jumps[sender] = true

func request_interact_local() -> void:
	if phase != "MATCH":
		return
	if is_host:
		pending_interactions[local_peer_id] = true
	else:
		rpc_id(1, "receive_interact_request")

@rpc("any_peer", "call_remote", "reliable")
func receive_interact_request() -> void:
	if not is_host or phase != "MATCH":
		return
	var sender := multiplayer.get_remote_sender_id()
	if players.has(sender) and players[sender].get("alive", true):
		pending_interactions[sender] = true

func consume_interact(peer_id: int) -> bool:
	var pressed := bool(pending_interactions.get(peer_id, false))
	pending_interactions.erase(peer_id)
	return pressed

func request_dance_local() -> void:
	if phase != "MATCH":
		return
	if is_host:
		pending_dances[local_peer_id] = true
	else:
		rpc_id(1, "receive_dance_request")

@rpc("any_peer", "call_remote", "reliable")
func receive_dance_request() -> void:
	if not is_host or phase != "MATCH":
		return
	var sender := multiplayer.get_remote_sender_id()
	if players.has(sender) and players[sender].get("alive", true):
		pending_dances[sender] = true

func consume_dance(peer_id: int) -> bool:
	var pressed := bool(pending_dances.get(peer_id, false))
	pending_dances.erase(peer_id)
	return pressed
func consume_jump(peer_id: int) -> bool:
	var pressed := bool(pending_jumps.get(peer_id, false))
	pending_jumps.erase(peer_id)
	return pressed

func request_grenade_local() -> void:
	if phase != "MATCH":
		return
	if is_host:
		grenade_requested.emit(local_peer_id)
	else:
		rpc_id(1, "request_grenade")

@rpc("any_peer", "call_remote", "reliable")
func request_grenade() -> void:
	if not is_host or phase != "MATCH":
		return
	var sender := multiplayer.get_remote_sender_id()
	if players.has(sender) and players[sender].get("alive", true):
		grenade_requested.emit(sender)

func broadcast_grenade_thrown(position: Vector3, velocity: Vector3) -> void:
	if is_host and multiplayer.multiplayer_peer != null:
		rpc("receive_grenade_thrown", position, velocity)

@rpc("authority", "call_remote", "reliable")
func receive_grenade_thrown(position: Vector3, velocity: Vector3) -> void:
	grenade_thrown.emit(position, velocity)

func broadcast_grenade_detonation(position: Vector3) -> void:
	if is_host and multiplayer.multiplayer_peer != null:
		rpc("receive_grenade_detonation", position)

@rpc("authority", "call_remote", "reliable")
func receive_grenade_detonation(position: Vector3) -> void:
	grenade_detonated.emit(position)

func send_input(controls: Dictionary) -> void:
	if phase not in ["BUS", "MATCH"]:
		return
	var clean := _sanitize_input(controls)
	if is_host:
		inputs[local_peer_id] = clean
		input_updated.emit(local_peer_id, clean)
	else:
		rpc_id(1, "receive_input", clean)

@rpc("any_peer", "call_remote", "unreliable")
func receive_input(controls: Dictionary) -> void:
	if not is_host:
		return
	var sender := multiplayer.get_remote_sender_id()
	if not players.has(sender) or players[sender]["air_state"] == "BUS":
		return
	var clean := _sanitize_input(controls)
	clean["interact"] = false
	clean["dance"] = false
	inputs[sender] = clean
	input_updated.emit(sender, clean)

func _sanitize_input(data: Dictionary) -> Dictionary:
	var move: Vector2 = data.get("move", Vector2.ZERO)
	if not move.is_finite():
		move = Vector2.ZERO
	move = move.limit_length(1.0)
	return {
		"move": move, "yaw": clampf(float(data.get("yaw", 0.0)), -100000.0, 100000.0),
		"jump": bool(data.get("jump", false)), "sprint": bool(data.get("sprint", false)),
		"climb": bool(data.get("climb", false)), "attack": bool(data.get("attack", false)),
		"grenade": bool(data.get("grenade", false)), "interact": bool(data.get("interact", false)),
		"dance": bool(data.get("dance", false))
	}

func get_input_for(peer_id: int) -> Dictionary:
	return inputs.get(peer_id, _empty_input())

func update_authoritative_state(peer_id: int, state: Dictionary) -> void:
	if not is_host or not players.has(peer_id):
		return
	for key in ["position", "yaw", "aim_yaw", "air_state", "health", "stamina", "max_stamina", "climb_gear", "sword", "grenades", "kills", "alive", "inventory", "vehicle"]:
		if state.has(key):
			players[peer_id][key] = state[key]

func _process(delta: float) -> void:
	if not is_host:
		return
	if phase == "COUNTDOWN":
		countdown = maxf(0.0, countdown - delta)
		if countdown <= 0.0:
			phase = "BUS"
			phase_changed.emit(phase)
			_broadcast_room()
	elif phase in ["BUS", "MATCH"]:
		round_clock += delta
		if phase == "BUS" and round_clock >= 18.0:
			for peer_id in players.keys():
				if players[peer_id].get("air_state", "BUS") == "BUS":
					players[peer_id]["air_state"] = "FALL"
			phase = "MATCH"
			phase_changed.emit(phase)
			_broadcast_room()
	if phase in ["COUNTDOWN", "BUS", "MATCH"]:
		_snapshot_accumulator += delta
		if _snapshot_accumulator >= SNAPSHOT_STEP:
			_snapshot_accumulator = 0.0
			_broadcast_snapshot()

func _room_data() -> Dictionary:
	return {"phase": phase, "countdown": countdown, "round_clock": round_clock, "players": players}

func _broadcast_room() -> void:
	room_changed.emit()
	if multiplayer.multiplayer_peer != null:
		rpc("receive_room", _room_data())

@rpc("authority", "call_remote", "reliable")
func receive_room(data: Dictionary) -> void:
	phase = str(data.get("phase", "LOBBY"))
	countdown = float(data.get("countdown", 0.0))
	round_clock = float(data.get("round_clock", 0.0))
	players = data.get("players", {})
	room_changed.emit()
	phase_changed.emit(phase)

func _broadcast_snapshot() -> void:
	var data := {"players": players, "npcs": npc_states, "vehicles": vehicle_states, "pickups": pickup_states, "phase": phase, "countdown": countdown, "round_clock": round_clock, "storm_radius": maxf(24.0, 170.0 - maxf(0.0, round_clock - 30.0) * 0.45)}
	snapshot_received.emit(data)
	if multiplayer.multiplayer_peer != null:
		rpc("receive_snapshot", data)

@rpc("authority", "call_remote", "unreliable")
func receive_snapshot(data: Dictionary) -> void:
	phase = str(data.get("phase", phase))
	round_clock = float(data.get("round_clock", round_clock))
	players = data.get("players", players)
	npc_states = data.get("npcs", npc_states)
	vehicle_states = data.get("vehicles", vehicle_states)
	pickup_states = data.get("pickups", pickup_states)
	countdown = float(data.get("countdown", countdown))
	snapshot_received.emit(data)

func finish_round(winner_name: String) -> void:
	if not is_host:
		return
	phase = "END"
	notice.emit("%s se lleva la última croqueta." % winner_name)
	_broadcast_room()
	phase_changed.emit(phase)

func lan_address() -> String:
	var candidates: Array[String] = []
	for address in IP.get_local_addresses():
		if not address.contains(".") or address.begins_with("127.") or address.begins_with("169.254.") or address.begins_with("0."):
			continue
		candidates.append(address)
	if candidates.is_empty():
		return "localhost"
	candidates.sort_custom(func(a: String, b: String) -> bool:
		return _local_ip_priority(a) < _local_ip_priority(b)
	)
	return candidates[0]

func _local_ip_priority(address: String) -> int:
	var parts := address.split(".")
	if parts.size() != 4:
		return 99
	var first := int(parts[0])
	var second := int(parts[1])
	if first == 192 and second == 168:
		return 0
	if first == 10:
		return 1
	if first == 172 and second >= 16 and second <= 31:
		return 2
	return 3