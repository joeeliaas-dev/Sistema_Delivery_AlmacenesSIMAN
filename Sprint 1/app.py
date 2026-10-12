"""Aplicación Flask del Sprint 1. Ejecutar con python app.py."""

from flask import Flask, jsonify, render_template, request
from werkzeug.exceptions import HTTPException

import pedidos


def create_app(test_config=None):
    app = Flask(__name__)
    app.json.ensure_ascii = False
    app.config["MAX_CONTENT_LENGTH"] = 16 * 1024
    if test_config:
        app.config.update(test_config)

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/pedidos")
    def obtener_pedidos():
        return jsonify(pedidos=pedidos.listar_pedidos())

    @app.patch("/api/pedidos/<int:pedido_id>/estado")
    def cambiar_estado(pedido_id):
        datos = request.get_json()
        if not isinstance(datos, dict):
            return jsonify(error="Envía un objeto JSON con el campo 'estado'."), 400
        try:
            pedido = pedidos.actualizar_estado_pedido(pedido_id, datos.get("estado"))
        except ValueError as error:
            return jsonify(error=str(error)), 400
        if pedido is None:
            return jsonify(error="No se encontró el pedido solicitado."), 404
        return jsonify(pedido=pedido)

    @app.errorhandler(HTTPException)
    def error_http(error):
        if request.path.startswith("/api/"):
            mensajes = {400: "El cuerpo de la solicitud debe ser JSON válido.",
                        413: "La solicitud es demasiado grande.",
                        415: "Usa el tipo de contenido application/json.",
                        500: "No fue posible procesar la solicitud. Intenta nuevamente."}
            return jsonify(error=mensajes.get(error.code, error.description)), error.code
        return error

    @app.after_request
    def evitar_cache_de_pedidos(response):
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
