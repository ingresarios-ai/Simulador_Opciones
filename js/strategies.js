/* =====================================================================
   INGRESARIOS · OptionLab — Plantillas de estrategias
   Cada plantilla define sus patas en función del spot (S) y un "paso" de strike.
   off = cuántos pasos de strike por encima (+) o por debajo (−) del ATM.
   dteMult permite calendarios (1 = DTE base, 2 = doble, etc.)
   ===================================================================== */
(function (global) {
  'use strict';

  const L = (kind, side, off, qty = 1, dteMult = 1) => ({ kind, side, off, qty, dteMult });

  const STRATEGIES = [
    // ---------- Direccionales básicas ----------
    {
      id: 'long-call', name: 'Long Call', group: 'Direccional', bias: 'Alcista', level: 1,
      legs: [L('call', 1, 0)],
      summary: 'Compras el derecho a comprar. Ganas si el precio sube con fuerza antes del vencimiento.',
      when: 'Esperas un movimiento alcista claro y rápido. Ideal con IV baja (opciones "baratas").',
      risk: 'Pierdes toda la prima si el precio no supera el strike + prima. El tiempo juega en contra (theta negativa).',
      pedem: 'Planear: ¿cuál es tu catalizador alcista? Define salida si el subyacente no se mueve en X días.'
    },
    {
      id: 'long-put', name: 'Long Put', group: 'Direccional', bias: 'Bajista', level: 1,
      legs: [L('put', 1, 0)],
      summary: 'Compras el derecho a vender. Ganas si el precio cae con fuerza.',
      when: 'Esperas caída rápida o quieres proteger acciones (seguro).',
      risk: 'Pierdes la prima si el precio no cae por debajo del strike − prima.',
      pedem: 'Planear: ¿es especulación o cobertura? Cambia completamente la gestión.'
    },
    {
      id: 'covered-call', name: 'Covered Call', group: 'Ingreso', bias: 'Neutral-alcista', level: 1,
      legs: [L('stock', 1, 0, 100), L('call', -1, 2)],
      summary: 'Tienes 100 acciones y vendes un call por encima. Cobras prima a cambio de limitar tu ganancia.',
      when: 'Eres dueño de la acción y crees que subirá poco o se quedará lateral.',
      risk: 'El riesgo real está en la acción (puede caer). La prima amortigua solo un poco.',
      pedem: 'Documentar: registra el "precio de venta efectivo" = strike + prima.'
    },
    {
      id: 'csp', name: 'Cash-Secured Put', group: 'Ingreso', bias: 'Neutral-alcista', level: 1,
      legs: [L('put', -1, -2)],
      summary: 'Vendes un put con el efectivo reservado para comprar la acción si te asignan.',
      when: 'Quieres comprar la acción "con descuento" y cobrar mientras esperas.',
      risk: 'Si la acción se desploma, compras a un precio muy superior al de mercado.',
      pedem: 'Planear: solo vende puts de acciones que quieras tener en tu portafolio.'
    },
    // ---------- Spreads verticales ----------
    {
      id: 'bull-call', name: 'Bull Call Spread', group: 'Spread vertical', bias: 'Alcista', level: 2,
      legs: [L('call', 1, 0), L('call', -1, 2)],
      summary: 'Compras un call y vendes otro más arriba. Pagas menos que un long call, pero topas la ganancia.',
      when: 'Alcista moderado con objetivo de precio definido.',
      risk: 'Pérdida máxima = débito pagado. Ganancia máxima = ancho − débito.',
      pedem: 'Ejecutar: entra como una sola orden (spread), nunca pata por pata.'
    },
    {
      id: 'bear-put', name: 'Bear Put Spread', group: 'Spread vertical', bias: 'Bajista', level: 2,
      legs: [L('put', 1, 0), L('put', -1, -2)],
      summary: 'Compras un put y vendes otro más abajo. Apuesta bajista con costo reducido.',
      when: 'Bajista moderado con objetivo definido.',
      risk: 'Pérdida máxima = débito. Ganancia máxima = ancho − débito.',
      pedem: 'Evaluar: ¿llegó al objetivo antes de tiempo? Considera cerrar al 50-75% de la ganancia máxima.'
    },
    {
      id: 'bull-put', name: 'Bull Put Spread (crédito)', group: 'Spread vertical', bias: 'Neutral-alcista', level: 2,
      legs: [L('put', -1, -2), L('put', 1, -4)],
      summary: 'Vendes un put y compras otro más abajo como protección. Cobras crédito; ganas si el precio no cae.',
      when: 'Mercado lateral o alcista. IV alta mejora el crédito.',
      risk: 'Pérdida máxima = ancho − crédito. Alta probabilidad, pero relación riesgo/beneficio desfavorable.',
      pedem: 'Planear: define el punto de corte (ej. 2× el crédito) ANTES de entrar.'
    },
    {
      id: 'bear-call', name: 'Bear Call Spread (crédito)', group: 'Spread vertical', bias: 'Neutral-bajista', level: 2,
      legs: [L('call', -1, 2), L('call', 1, 4)],
      summary: 'Vendes un call y compras otro más arriba. Cobras crédito; ganas si el precio no sube.',
      when: 'Resistencia clara arriba, mercado lateral o bajista.',
      risk: 'Pérdida máxima = ancho − crédito.',
      pedem: 'Mejorar: ¿respetó la resistencia de tu análisis técnico? Anótalo en el journal.'
    },
    // ---------- Neutrales ----------
    {
      id: 'iron-condor', name: 'Iron Condor', group: 'Neutral', bias: 'Lateral', level: 3,
      legs: [L('put', 1, -6), L('put', -1, -4), L('call', -1, 4), L('call', 1, 6)],
      summary: 'Un bull put spread + un bear call spread. Cobras crédito si el precio se queda dentro del rango.',
      when: 'Mercado lateral con IV alta (IV Rank > 30). La estrategia estrella de ingreso.',
      risk: 'Pérdida máxima = ancho de un lado − crédito total. Dos frentes de riesgo: arriba y abajo.',
      pedem: 'Planear: strikes cortos en ~16 delta (≈ 1σ). Ejecutar: entra con 30-45 DTE. Evaluar: cierra al 50% del crédito.'
    },
    {
      id: 'iron-butterfly', name: 'Iron Butterfly', group: 'Neutral', bias: 'Lateral', level: 3,
      legs: [L('put', 1, -4), L('put', -1, 0), L('call', -1, 0), L('call', 1, 4)],
      summary: 'Vendes un straddle ATM y compras alas de protección. Máximo crédito si el precio se clava en el strike central.',
      when: 'Esperas que el precio "pin" cerca del strike central (muy usado en 0DTE).',
      risk: 'Rango de ganancia estrecho; requiere gestión activa.',
      pedem: 'Ejecutar: define la zona de salida por tiempo, no solo por precio.'
    },
    {
      id: 'long-straddle', name: 'Long Straddle', group: 'Volatilidad', bias: 'Movimiento fuerte', level: 2,
      legs: [L('call', 1, 0), L('put', 1, 0)],
      summary: 'Compras call y put en el mismo strike. Ganas si el precio se mueve MUCHO, en cualquier dirección.',
      when: 'Antes de earnings o eventos con resultado binario, cuando la IV aún es baja.',
      risk: 'Doble prima pagada; el tiempo y la caída de IV (IV crush) te golpean doble.',
      pedem: 'Planear: calcula el movimiento esperado; necesitas superarlo para ganar.'
    },
    {
      id: 'short-straddle', name: 'Short Straddle', group: 'Volatilidad', bias: 'Lateral', level: 4,
      legs: [L('call', -1, 0), L('put', -1, 0)],
      summary: 'Vendes call y put ATM. Máximo cobro de prima; máximo riesgo.',
      when: 'IV extremadamente alta y expectativa de calma. Solo traders experimentados.',
      risk: 'Pérdida ilimitada hacia arriba y hasta cero hacia abajo.',
      pedem: 'Planear: el tamaño es TODO. Si no puedes dormir con la posición, es demasiado grande.'
    },
    {
      id: 'long-strangle', name: 'Long Strangle', group: 'Volatilidad', bias: 'Movimiento fuerte', level: 2,
      legs: [L('put', 1, -3), L('call', 1, 3)],
      summary: 'Como el straddle, pero con strikes OTM: más barato, necesita un movimiento mayor.',
      when: 'Evento binario, presupuesto limitado.',
      risk: 'Pierdes toda la prima si el precio se queda entre los strikes.',
      pedem: 'Evaluar: ¿cuánto del movimiento esperado se descontó en la prima?'
    },
    {
      id: 'short-strangle', name: 'Short Strangle', group: 'Volatilidad', bias: 'Lateral', level: 4,
      legs: [L('put', -1, -4), L('call', -1, 4)],
      summary: 'Vendes put y call OTM. Cobras prima si el precio se queda en el rango. Sin protección.',
      when: 'IV alta, mercado en rango. Requiere margen amplio.',
      risk: 'Pérdida ilimitada. Un iron condor es la versión "con cinturón de seguridad".',
      pedem: 'Planear: define el roll ANTES de entrar (cuándo y hacia dónde).'
    },
    {
      id: 'butterfly', name: 'Long Call Butterfly', group: 'Neutral', bias: 'Lateral', level: 3,
      legs: [L('call', 1, -3), L('call', -1, 0, 2), L('call', 1, 3)],
      summary: 'Compras 1 call abajo, vendes 2 ATM, compras 1 arriba. Barata, con gran pago si el precio se clava en el centro.',
      when: 'Objetivo de precio preciso; bajo costo, baja probabilidad.',
      risk: 'Pérdida máxima = débito (pequeño).',
      pedem: 'Documentar: excelente para practicar precisión de objetivos técnicos.'
    },
    {
      id: 'calendar', name: 'Calendar Spread (call)', group: 'Tiempo', bias: 'Lateral', level: 3,
      legs: [L('call', -1, 0, 1, 1), L('call', 1, 0, 1, 2)],
      summary: 'Vendes el call cercano y compras el mismo strike en un vencimiento más lejano. Ganas con el paso del tiempo y subida de IV.',
      when: 'Precio lateral cerca del strike; IV del lejano relativamente barata.',
      risk: 'Pérdida máxima ≈ débito pagado. Movimientos grandes la perjudican.',
      pedem: 'Evaluar: observa theta positiva vs. vega positiva; es un trade de tiempo, no de dirección.'
    },
    {
      id: 'collar', name: 'Collar', group: 'Cobertura', bias: 'Protección', level: 2,
      legs: [L('stock', 1, 0, 100), L('put', 1, -2), L('call', -1, 2)],
      summary: 'Acciones + put comprado (seguro) financiado vendiendo un call. Protección casi gratis a cambio de techo.',
      when: 'Quieres proteger ganancias sin vender la acción.',
      risk: 'Renuncias a la subida por encima del call.',
      pedem: 'Planear: ideal antes de eventos de alto riesgo en acciones que no quieres soltar.'
    },
    {
      id: 'jade-lizard', name: 'Jade Lizard', group: 'Ingreso', bias: 'Neutral-alcista', level: 4,
      legs: [L('put', -1, -3), L('call', -1, 3), L('call', 1, 5)],
      summary: 'Short put + bear call spread. Si el crédito total > ancho del call spread, NO hay riesgo al alza.',
      when: 'IV alta, sesgo alcista, quieres eliminar el riesgo hacia arriba.',
      risk: 'Riesgo hacia abajo como un short put.',
      pedem: 'Ejecutar: verifica que crédito ≥ ancho del spread de calls antes de enviar la orden.'
    },
    {
      id: 'ratio-spread', name: 'Call Ratio Spread (1×2)', group: 'Avanzada', bias: 'Alcista moderado', level: 4,
      legs: [L('call', 1, 0), L('call', -1, 3, 2)],
      summary: 'Compras 1 call y vendes 2 más arriba. A menudo sin costo, pero con riesgo ilimitado si el precio se dispara.',
      when: 'Alcista moderado con fuerte convicción de que NO superará el strike vendido.',
      risk: 'Ilimitado por encima del segundo strike. Requiere margen.',
      pedem: 'Planear: define el stop en el subyacente, no en la prima.'
    }
  ];

  // Glosario didáctico (tooltips)
  const GLOSSARY = {
    delta: 'Delta: cuánto cambia el valor de la posición si el subyacente sube $1. También ≈ probabilidad de terminar ITM.',
    gamma: 'Gamma: cuánto cambia la delta por cada $1 de movimiento. Alta gamma = la posición "acelera".',
    theta: 'Theta: cuánto gana/pierde la posición por cada día que pasa (todo lo demás igual). Positiva = el tiempo te paga.',
    vega: 'Vega: cuánto cambia la posición si la volatilidad implícita sube 1 punto. Positiva = te beneficia que suba la IV.',
    pop: 'Probabilidad de ganancia (POP): probabilidad estimada de terminar con P/L > 0 al vencimiento, según la IV actual.',
    be: 'Breakeven: precio del subyacente en el que al vencimiento no ganas ni pierdes.',
    ev: 'Valor esperado: promedio ponderado por probabilidad del P/L al vencimiento. Útil para comparar estrategias.',
    iv: 'Volatilidad implícita (IV): la "expectativa de movimiento" que el mercado descuenta en las primas. Alta IV = primas caras.',
    dte: 'DTE: días hasta el vencimiento (Days To Expiration).',
    em: 'Movimiento esperado (1σ): rango en el que el mercado espera que termine el precio ~68% de las veces.'
  };

  global.Strategies = { STRATEGIES, GLOSSARY };
})(typeof window !== 'undefined' ? window : globalThis);
