extends Node3D

const WORLD_SCRIPT := preload("res://scripts/Island.gd")

func _ready() -> void:
	Session.phase = "BUS"
	Session.round_clock = 10.0
	var world := WORLD_SCRIPT.new()
	world.name = "VistaPreviaIsla"
	add_child(world)
	var camera := Camera3D.new()
	camera.name = "CinematicCamera"
	camera.position = Vector3(58.0, 204.0, 142.0)
	camera.fov = 56.0
	add_child(camera)
	camera.look_at(Vector3(-8.0, 112.0, 0.0), Vector3.UP)
	camera.current = true
	var ui := CanvasLayer.new()
	add_child(ui)
	var title := Label.new()
	title.text = "GORDO ROYALE   /   RUTA AL PLATO"
	title.position = Vector2(42.0, 34.0)
	title.add_theme_font_size_override("font_size", 23)
	title.add_theme_color_override("font_color", Color("fff0d2"))
	ui.add_child(title)
	var subtitle := Label.new()
	subtitle.text = "EL AUTOCAR DEL CIELO  •  COSTA DORADA"
	subtitle.position = Vector2(44.0, 68.0)
	subtitle.add_theme_font_size_override("font_size", 13)
	subtitle.add_theme_color_override("font_color", Color("b9d1ca"))
	ui.add_child(subtitle)

