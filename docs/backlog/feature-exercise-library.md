# Feature: Biblioteca de ejercicios con media (ya parcialmente implementado)

**Tipo:** Feature  
**Prioridad:** Media  
**Estado:** Backend completado. Frontend completado (página Ejercicios). Pendiente: configurar API keys.

## Lo que ya está implementado

- **Modelo DB:** `Exercise` tiene `video_url_1`, `video_url_2`, `image_url` (nullable)
- **Endpoint:** `GET /exercises/{id}/media` — busca en YouTube + Google Images, cachea en DB
- **Frontend:** Página `/ejercicios` con cards expandibles que muestran imagen + videos
- **Sidebar:** Entrada "Ejercicios" que reemplaza a "Récords"

## Lo que falta para que funcione completamente

### 1. Configurar API keys en producción

En el backend `.env` (Render / producción):

```
YOUTUBE_API_KEY=AIza...
GOOGLE_SEARCH_API_KEY=AIza...
GOOGLE_SEARCH_CX=123456789:abcdef
```

### 2. Crear las credenciales en Google Cloud Console

**YouTube Data API v3:**
1. Google Cloud Console → APIs & Services → Enable APIs
2. Buscar "YouTube Data API v3" → Enable
3. Credentials → Create API Key → restringir a YouTube Data API

**Google Custom Search API:**
1. Enable "Custom Search API" en Google Cloud Console
2. Ir a [Programmable Search Engine](https://programmablesearchengine.google.com/) → Create new search engine
3. Configurar para buscar en toda la web + activar "Image search"
4. Copiar el Search Engine ID (= `GOOGLE_SEARCH_CX`)
5. Usar la misma API key o crear una nueva restringida a Custom Search API

### 3. Nota de costes

- YouTube Data API: 10,000 unidades/día gratuitas (cada búsqueda = 100 unidades → ~100 búsquedas/día gratis)
- Custom Search API: 100 búsquedas/día gratuitas, luego $5/1000

Las URLs se cachean en DB tras la primera búsqueda, por lo que cada ejercicio solo consume quota una vez.

## UX actual de la página

- Pills de filtro por músculo
- Cards colapsadas con nombre + PR
- Al expandir: imagen Google (izquierda) + 2 iframes YouTube (derecha)
- Sin API keys → mensaje informativo, sin error
