"""Acceso a pedidos. Esta es la única capa que debe cambiar al integrar Firebase."""

from threading import Lock


PEDIDOS_DE_PRUEBA = [
    {"id": 10481, "cliente": "María Fernanda López", "direccion": "12 calle 6-25, zona 10, Ciudad de Guatemala",
     "zona": "Zona 10", "paquete": "Hogar · 2 paquetes", "ventana": "09:00 – 12:00", "estado": "pendiente"},
    {"id": 10482, "cliente": "Carlos Méndez", "direccion": "5a avenida 14-32, zona 14, Ciudad de Guatemala",
     "zona": "Zona 14", "paquete": "Tecnología · 1 paquete", "ventana": "09:00 – 12:00", "estado": "pendiente"},
    {"id": 10483, "cliente": "Ana Lucía Rodríguez", "direccion": "Boulevard Vista Hermosa 18-42, zona 15, Ciudad de Guatemala",
     "zona": "Zona 15", "paquete": "Moda · 1 paquete", "ventana": "10:00 – 13:00", "estado": "pendiente"},
    {"id": 10484, "cliente": "Diego Castillo", "direccion": "8a calle 3-16, zona 13, Ciudad de Guatemala",
     "zona": "Zona 13", "paquete": "Hogar · 3 paquetes", "ventana": "11:00 – 14:00", "estado": "pendiente"},
    {"id": 10485, "cliente": "Sofía Hernández", "direccion": "Calzada Roosevelt 22-48, zona 11, Ciudad de Guatemala",
     "zona": "Zona 11", "paquete": "Belleza · 1 paquete", "ventana": "13:00 – 16:00", "estado": "pendiente"},
    {"id": 10486, "cliente": "José Andrés Ramírez", "direccion": "6a avenida 9-08, zona 7, Ciudad de Guatemala",
     "zona": "Zona 7", "paquete": "Tecnología · 2 paquetes", "ventana": "14:00 – 17:00", "estado": "pendiente"},
]

_pedidos = [pedido.copy() for pedido in PEDIDOS_DE_PRUEBA]
_lock = Lock()


def listar_pedidos() -> list[dict]:
    """Devuelve los pedidos como diccionarios, sin exponer el almacenamiento interno."""
    # TODO: Reemplazar con Firebase: leer la colección "pedidos" y mantener estos campos.
    # Convertir el ID del documento al campo "id" y conservar un orden estable.
    with _lock:
        return [pedido.copy() for pedido in _pedidos]


def actualizar_estado_pedido(pedido_id: int, estado: str) -> dict | None:
    """Guarda fallido/entregado y devuelve el pedido actualizado; None si no existe."""
    if not isinstance(estado, str) or estado not in {"fallido", "entregado"}:
        raise ValueError("El estado debe ser 'fallido' o 'entregado'.")

    # TODO: Reemplazar con Firebase: actualizar "estado" en el documento del pedido.
    # Devolver el documento actualizado (o None si no existe), con el mismo contrato.
    with _lock:
        for pedido in _pedidos:
            if pedido["id"] == pedido_id:
                pedido["estado"] = estado
                return pedido.copy()
    return None
