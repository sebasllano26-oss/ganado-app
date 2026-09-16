import { dateFormat, schemas } from "./runtime.mjs";
export function demoData(now = new Date()) {
  const data = Object.fromEntries(Object.keys(schemas).map((k) => [k, []]));
  const date = (days) =>
    dateFormat(
      new Date(now.getTime() - days * 86_400_000),
      "America/Bogota",
      "yyyy-MM-dd",
    );
  const predios = ["El Porvenir", "La Esperanza"];
  data.predios = predios.map((nombre, i) => ({
    id_predio: "PRE-" + i,
    nombre,
    propietario: "Ganadería de demostración",
    activo: "SI",
    notas: "Datos ficticios",
  }));
  data.lotes = predios.flatMap((_, i) =>
    [1, 2].map((n) => ({
      id_lote: `LOT-${i}-${n}`,
      id_predio: "PRE-" + i,
      nombre: "Potrero " + n,
      area_ha: 8 + n,
      activo: "SI",
      notas: "",
    })),
  );
  for (let i = 1; i <= 28; i++) {
    const codigo = "DEMO-" + String(i).padStart(3, "0");
    const initial = 180 + i * 4;
    const rate = 0.28 + (i % 6) * 0.045;
    data.animales.push({
      codigo,
      predio: predios[i % 2],
      lote: "Potrero " + ((i % 2) + 1),
      tipo:
        i % 4 === 0 ? "VACA" : i % 2 ? "TERNERO LEVANTE" : "NOVILLA VIENTRE",
      sexo: i % 2 ? "MACHO" : "HEMBRA",
      fecha_ingreso: date(180),
      peso_inicial: initial,
      precio_compra: initial * 8500,
      estado: i > 26 ? "VENDIDO" : "ACTIVO",
      propietario: "Ganadería de demostración",
      tipo_ingreso: "COMPRA",
      proveedor: "Proveedor de ejemplo",
      indicaciones: "Registro ficticio para explorar Gestión Ganadera",
      estado_reproductivo: i % 4 === 0 ? "Preñada" : "",
      fecha_nacimiento: date(700),
      meses: 6,
    });
    for (let m = 1; m <= 6; m++)
      data.mediciones.push({
        id_medicion: `MED-${i}-${m}`,
        codigo,
        fecha: date(180 - m * 28),
        peso: Math.round((initial + rate * m * 28) * 10) / 10,
        ganancia_peso: rate * 28,
        dias_desde_anterior: 28,
        gdp: rate,
        clasificacion: "NORMAL",
        observacion: "Pesaje de demostración",
        alerta: "",
      });
    if (i > 26)
      data.ventas.push({
        id_venta: "VEN-" + i,
        codigo,
        fecha_venta: date(5),
        precio_salida: 3300000,
        peso_salida: 330,
        precio_kg: 10000,
        precio_compra: initial * 8500,
        utilidad: 3300000 - initial * 8500,
        dias_en_predio: 175,
        comprador: "Comprador de ejemplo",
      });
  }
  data.sanidad = [
    {
      id_evento: "SAN-1",
      codigo: "DEMO-004",
      fecha: date(12),
      tipo: "VACUNA",
      medicamento: "Registro sanitario de ejemplo",
      dosis: "Según indicación veterinaria",
      responsable: "Veterinario de ejemplo",
      proxima_fecha: date(-3),
      observacion: "Datos ficticios; no constituye una pauta de tratamiento.",
    },
  ];
  data.tareas = [
    {
      id_tarea: "TAR-1",
      id_predio: "PRE-0",
      id_lote: "LOT-0-1",
      actividad: "Revisión de cercas",
      descripcion: "Revisar el perímetro del potrero",
      responsable: "Equipo de campo",
      fecha_programada: date(0),
      estado: "PROGRAMADA",
      prioridad: "NORMAL",
    },
    {
      id_tarea: "TAR-2",
      id_predio: "PRE-1",
      id_lote: "",
      actividad: "Pesaje",
      descripcion: "Pesaje de seguimiento",
      responsable: "Equipo de campo",
      fecha_programada: date(-2),
      estado: "PROGRAMADA",
      prioridad: "NORMAL",
    },
  ];
  data.lluvias = Array.from({ length: 12 }, (_, i) => ({
    id_lluvia: "LLU-" + i,
    id_predio: "PRE-" + (i % 2),
    fecha: date(i * 3),
    milimetros: 4 + (i % 5) * 3,
    registrado_por: "Equipo de ejemplo",
    observacion: "Dato ficticio",
  }));
  data.facturas = [
    {
      id_factura: "FAC-1",
      fecha: date(8),
      proveedor: "Almacén de ejemplo",
      numero: "DEMO-001",
      concepto: "Mantenimiento de cercas",
      categoria: "Mantenimiento",
      id_predio: "PRE-0",
      subtotal: 150000,
      iva: 28500,
      total: 178500,
      estado: "PENDIENTE",
      revisada: "SI",
      mes: date(8).slice(0, 7),
      notas: "Factura ficticia",
    },
  ];
  data.catalogos = [
    { categoria: "propietario", valor: "Ganadería de demostración" },
  ];
  return data;
}
