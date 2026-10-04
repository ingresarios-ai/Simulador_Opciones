# OptionLab · INGRESARIOS

Constructor de estrategias de opciones estilo OptionStrat, con estética blueprint INGRESARIOS y **Modo Aprende** (explicaciones en español + marco PEDEM) para estudiantes.

Sin dependencias, sin build: HTML + CSS + JavaScript puro. Funciona abriendo `index.html` o sirviéndolo desde cualquier hosting estático (Cloudflare Pages, Vercel, Netlify, GitHub Pages).

## Estructura

```
index.html          Interfaz
css/styles.css      Estilos (tokens de marca: #080B10, #00D2FF, #00FF94, Syne + DM Mono)
js/pricing.js       Motor: Black-Scholes-Merton, Greeks, P/L, breakevens, POP, valor esperado, mapa P/L
js/strategies.js    19 plantillas de estrategias + textos didácticos (qué es, cuándo, riesgo, PEDEM) + glosario
js/chart.js         Gráfico P/L en canvas (vencimiento, T+0, T+n, zonas, strikes, breakevens, tooltip)
js/app.js           Estado, render, simulador, tabla de patas, guardar/compartir
```

## Funcionalidades

- 19 plantillas: long call/put, covered call, cash-secured put, 4 spreads verticales, iron condor, iron butterfly, straddles, strangles, butterfly, calendar, collar, jade lizard, ratio spread.
- Patas 100 % editables (lado, tipo, strike, cantidad, DTE, IV, prima). La prima se calcula por Black-Scholes y se puede sobrescribir con el precio real del bróker (doble clic para volver a la teórica).
- Métricas: ganancia/pérdida máxima (detecta riesgo ilimitado), breakevens, probabilidad de ganancia, valor esperado, riesgo/beneficio, capital aproximado, theta diaria.
- Gráfico P/L: payoff al vencimiento + curva de hoy + curva simulada (T+n días, cambio de IV).
- Simulador "¿qué pasa si…?": precio, días transcurridos y cambio de IV con P/L en vivo.
- Greeks netos de posición con lectura en español.
- Mapa de calor P/L (precio × fecha).
- Modo Aprende: explicación de la estrategia, cuándo usarla, riesgo, checklist PEDEM y lectura del setup (movimiento esperado, probabilidad entre breakevens).
- Guardar estrategias en el navegador (localStorage) y compartir por enlace (el estado viaja en el `#hash` de la URL).

## Despliegue

Sube la carpeta tal cual. Ejemplo con Cloudflare Pages: *Create project → Upload assets → arrastra la carpeta*.

## Próximos pasos sugeridos

1. **Datos reales**: conectar una API de cadenas de opciones (FMP, Tradier, tastytrade) y rellenar strikes/IV reales por vencimiento. El motor ya acepta IV por pata.
2. **Exportar al journal PEDEM**: botón "Documentar" que envíe el snapshot (`snapshot()` en `app.js`) a Google Sheets / GHL.
3. **Retos**: modo "Reto 21" con escenarios predefinidos y puntaje.
4. **Multi-vencimiento en el gráfico**: hoy la curva de vencimiento usa el DTE más corto (correcto para calendarios, pero puede mostrarse también la curva al vencimiento largo).

## Modelo

Black-Scholes-Merton europeo, sin dividendos por defecto (`q = 0`, parametrizable en `Pricing.bsm`), base 365 días, multiplicador 100. Probabilidad de ganancia bajo distribución lognormal risk-neutral con la IV promedio de las patas. Herramienta educativa: no incluye comisiones, deslizamiento ni ejercicio anticipado.
