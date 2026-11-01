# ADR 0004 · Uso de Geoapify como motor de geocodificación

Estado: Aceptada · 1 de noviembre de 2026

Contexto La geolocalización no es un complemento del sistema, sino un eje operativo de la logística. Necesitamos convertir direcciones de texto en coordenadas, comprobar si caen dentro de la zona de reparto, comparar las colonias con los datos del Excel y generar niveles de confianza espaciales. No es viable construir un motor de geocodificación propio para obtener esta precisión.

Decisión Utilizaremos Geoapify como una capa de servicio encapsulada para transformar direcciones, validar ubicaciones y decidir autónomamente si una entrega está correcta o requiere revisión humana.

Consecuencias

La lógica no se dispersa por la aplicación ni contamina la interfaz (UI).

La validación inteligente previene errores de asignación si la calle existe pero la colonia no coincide.

Convierte un prototipo visual en una solución operativa.

Introduce dependencia técnica externa, sometiendo la operación a las limitaciones de uso diario (cuotas).

Expone el sistema a posibles errores o caídas del servicio de Geoapify.
