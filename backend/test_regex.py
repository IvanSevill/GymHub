import re

lines = [
    "✅ Biceps - Curl biceps 14kg",
    "✅ Espalda - Remo 50-55kg",
    "✅ Biceps - Low cable unilateral 15kg",
    "✅ Espalda - Lumbares 5kg",
    "✅ Biceps - Barra Z 15kg",
    "✅ Espalda - Jalón al pecho 50kg",
    "Peso muerto 18-16",
    "Espalda unilateral máquina con discos (10kg)",
    "Espalda jalón al pecho agarre corto (47kg)",
    "Espalda jalón al pecho agarre largo (53-47kg)",
    "Espalda lumbares (+5kg)",
    "Espalda baja (5-10kg)",
    "Espalda remo discos agarre corto (20-25kg)",
    "Biceps mancuernas (14kg)",
    "Biceps polea baja (30-35kg)",
    "Biceps curl banco Scott polea (20-15kg)",
    "Biceps curl máquina (20kg)",
    "Cardio en cinta 15min"
]

EXERCISE_PATTERN = re.compile(
    r"^(?:✅\s*)?(?P<name>.*?[a-zA-ZñÑáéíóúÁÉÍÓÚ)])\s*"
    r"(?:\()? ?(?P<value>[\+\-\d\.]+)(?:\s*(?P<unit>kg|min|kilos|minutos))? ?(?:\))?"
    r"(?:\s*(?P<reps>\d+)\s*(?:reps|rpt|x)?)?$",
    re.IGNORECASE
)

for line in lines:
    m = EXERCISE_PATTERN.match(line)
    if m:
        print(f"MATCH: {m.group('name')} | {m.group('value')} | {m.group('unit')}")
    else:
        print(f"NO MATCH: {line}")
