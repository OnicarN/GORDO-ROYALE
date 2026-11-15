extends Node3D
class_name RideableVehicle

@export var display_name := "Moto con sidecar"
@export var max_speed := 24.0
@export var turn_rate := 1.65
var occupant_id := 0
var velocity := Vector3.ZERO
var is_sidecar := true

func drive(move: Vector2, dt: float, ground_height: float) -> void:
	if occupant_id == 0:
		velocity = velocity.move_toward(Vector3.ZERO, 8.0 * dt)
		return
	var throttle := -move.y
	if absf(throttle) > 0.05:
		rotation.y += move.x * turn_rate * dt * signf(throttle)
	var forward := -global_basis.z
	var target := forward * throttle * max_speed
	velocity.x = move_toward(velocity.x, target.x, 18.0 * dt)
	velocity.z = move_toward(velocity.z, target.z, 18.0 * dt)
	position += velocity * dt
	position.y = ground_height

func release() -> void:
	occupant_id = 0

func network_state() -> Dictionary:
	return {"position": global_position, "yaw": rotation.y, "occupant_id": occupant_id}

func apply_network_state(state: Dictionary, smooth := true) -> void:
	if state.has("position"):
		var target: Vector3 = state["position"]
		global_position = global_position.lerp(target, 0.55 if smooth else 1.0)
	if state.has("yaw"):
		rotation.y = lerp_angle(rotation.y, float(state["yaw"]), 0.55 if smooth else 1.0)
	if state.has("occupant_id"):
		occupant_id = int(state["occupant_id"])