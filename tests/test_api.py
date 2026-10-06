"""Contrato de pedidos: ejecutar con python -m unittest discover -s tests -v."""

import copy
import json
import unittest
from unittest.mock import patch

from app import create_app
import pedidos


class PedidosApiTest(unittest.TestCase):
    def setUp(self):
        self.storage = patch.object(pedidos, "_pedidos", copy.deepcopy(pedidos.PEDIDOS_DE_PRUEBA))
        self.storage.start()
        self.addCleanup(self.storage.stop)
        self.client = create_app({"TESTING": True}).test_client()
        self.first_id = pedidos.PEDIDOS_DE_PRUEBA[0]["id"]

    def test_lista_pedidos_pendientes_con_los_campos_requeridos(self):
        response = self.client.get("/api/pedidos")
        self.assertEqual(response.status_code, 200)
        self.assertIn("no-store", response.headers["Cache-Control"])
        items = response.json["pedidos"]
        self.assertGreater(len(items), 0)
        self.assertEqual(len({item["id"] for item in items}), len(items))
        for item in items:
            self.assertTrue({"id", "cliente", "direccion", "estado"} <= item.keys())
            self.assertEqual(item["estado"], "pendiente")

    def test_entregado_y_fallido_se_guardan_y_no_afectan_otros_pedidos(self):
        ids = [item["id"] for item in pedidos.PEDIDOS_DE_PRUEBA]
        for order_id, state in zip(ids, ["entregado", "fallido"]):
            response = self.client.patch(f"/api/pedidos/{order_id}/estado", json={"estado": state})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json["pedido"]["estado"], state)
        saved = self.client.get("/api/pedidos").json["pedidos"]
        self.assertEqual([item["estado"] for item in saved[:3]], ["entregado", "fallido", "pendiente"])

    def test_se_puede_repetir_y_corregir_un_estado(self):
        for state in ["fallido", "fallido", "entregado"]:
            response = self.client.patch(f"/api/pedidos/{self.first_id}/estado", json={"estado": state})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json["pedido"]["estado"], state)

    def test_rechaza_estados_y_cuerpos_invalidos_sin_cambiar_datos(self):
        invalid_bodies = [{}, {"estado": "en curso"}, {"estado": "pendiente"}, {"estado": None},
                          {"estado": []}, {"estado": {}}, [], "entregado", None]
        before = self.client.get("/api/pedidos").json
        for body in invalid_bodies:
            with self.subTest(body=body):
                response = self.client.patch(f"/api/pedidos/{self.first_id}/estado",
                                             data=json.dumps(body), content_type="application/json")
                self.assertEqual(response.status_code, 400)
                self.assertIsInstance(response.json["error"], str)
        self.assertEqual(self.client.get("/api/pedidos").json, before)

    def test_pedido_inexistente_devuelve_404(self):
        response = self.client.patch("/api/pedidos/999999/estado", json={"estado": "entregado"})
        self.assertEqual(response.status_code, 404)
        self.assertIn("error", response.json)

    def test_rechaza_json_malformado_y_tipo_de_contenido_incorrecto(self):
        url = f"/api/pedidos/{self.first_id}/estado"
        malformed = self.client.patch(url, data="{", content_type="application/json")
        self.assertEqual(malformed.status_code, 400)
        self.assertIn("error", malformed.json)
        text = self.client.patch(url, data='{"estado":"entregado"}', content_type="text/plain")
        self.assertEqual(text.status_code, 415)
        self.assertIn("error", text.json)

    def test_lecturas_y_actualizaciones_no_exponen_la_lista_interna(self):
        items = pedidos.listar_pedidos()
        items[0]["estado"] = "fallido"
        items.clear()
        self.assertEqual(pedidos.listar_pedidos()[0]["estado"], "pendiente")
        item = pedidos.actualizar_estado_pedido(self.first_id, "entregado")
        item["cliente"] = "Cambio externo"
        self.assertNotEqual(pedidos.listar_pedidos()[0]["cliente"], "Cambio externo")

    def test_la_capa_de_datos_valida_el_estado(self):
        for state in ["invalido", [], None]:
            with self.subTest(state=state), self.assertRaises(ValueError):
                pedidos.actualizar_estado_pedido(self.first_id, state)
        self.assertIsNone(pedidos.actualizar_estado_pedido(999999, "entregado"))


if __name__ == "__main__":
    unittest.main()
