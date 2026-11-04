import { AnimalDTO, IndicadoresDTO } from '../Modelos/GanaderoModel';
import { AlmacenLocalService } from './almacen-local';
import { categoriaAnimal } from './hato.service';

//EXCEL DE LA FINCA (FASE 4): SE ARMA EN EL CELULAR CON LA COPIA LOCAL (SIRVE SIN SEÑAL) Y LOS ULTIMOS INDICADORES QUE CALCULO LA BASE
//HOJAS: INDICADORES, HATO, PESAJES, ORDEÑOS, SANIDAD, REPRODUCCION, SALIDAS. NO CALCULA NADA NUEVO: SOLO LISTA LO QUE HAY
//exceljs ES COMMONJS: EN EL BUILD DE PRODUCCION LLEGA EN .default (APRENDIZAJES)

const VERDE = 'FF2F6B2F';

function fecha(t: string | null | undefined): string {
  return t ? t.slice(0, 10) : '';
}

function numero(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const TEXTO_SALIDA: Record<string, string> = { VENTA: 'Venta', MUERTE: 'Muerte', TRASLADO: 'Traslado' };
const TEXTO_PARTO: Record<string, string> = { NORMAL: 'Normal', ASISTIDO: 'Asistido', CESAREA: 'Cesárea', ABORTO: 'Aborto' };

export async function descargarExcelFinca(almacenLocal: AlmacenLocalService, nombreFinca: string, indicadores: IndicadoresDTO | null): Promise<string> {
  const m: any = await import('exceljs');
  const ExcelJS = m.default ?? m;
  const d = await almacenLocal.leerTodoParaExcel();

  const porUuid = new Map<string, AnimalDTO>(d.animales.map(a => [a.UUID_ANIMAL, a]));
  const lotes = new Map(d.lotes.map(l => [l.UUID_LOTE, l.NOM_LOTE]));
  const razas = new Map(d.razas.map(r => [r.ID_RAZA, r.NOM_RAZA]));
  const vacunas = new Map(d.vacunas.map(v => [v.ID_VACUNA, v.NOM_VACUNA]));
  const madres = new Set(d.partos.map(p => p.UUID_ANIMAL));
  const chapeta = (uuid: string | null) => {
    if (!uuid) return '';
    const a = porUuid.get(uuid);
    return a ? (a.CHAPETA_ANIMAL ?? a.NOM_ANIMAL ?? 'Sin chapeta') : '';
  };
  const pendiente = (x: { _pendiente?: boolean }) => (x._pendiente ? 'Sin subir' : '');

  const libro = new ExcelJS.Workbook();
  libro.creator = 'Ganadero';
  libro.created = new Date();

  //UNA HOJA CON ENCABEZADO VERDE, FILA FIJA Y FILTRO
  const hoja = (nombre: string, columnas: { header: string; key: string; width: number }[], filas: any[]) => {
    const h = libro.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
    h.columns = columnas;
    filas.forEach(f => h.addRow(f));
    const enc = h.getRow(1);
    enc.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    enc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
    if (filas.length) {
      h.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
    }
    return h;
  };

  //1. INDICADORES (LOS ULTIMOS QUE CALCULO EL SERVIDOR)
  const hi = libro.addWorksheet('Indicadores');
  hi.columns = [{ width: 34 }, { width: 18 }, { width: 60 }];
  hi.addRow([nombreFinca]).font = { bold: true, size: 14 };
  if (indicadores) {
    hi.addRow([`Del ${indicadores.DESDE} al ${indicadores.HASTA}`]);
    hi.addRow([]);
    const enc = hi.addRow(['Indicador', 'Valor', 'Cómo se calcula']);
    enc.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    enc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
    const i = indicadores;
    const filas: [string, number | string | null, string][] = [
      ['Natalidad (%)', i.NATALIDAD.PORCENTAJE, `${i.NATALIDAD.CRIAS_VIVAS} crías vivas / ${i.NATALIDAD.HEMBRAS} hembras reproductoras (24 meses o más, o con partos) × 100`],
      ['Mortalidad (%)', i.MORTALIDAD.PORCENTAJE, `${i.MORTALIDAD.MUERTES} muertes / ${i.MORTALIDAD.ANIMALES} animales que estuvieron en la finca × 100`],
      ['Intervalo entre partos (días)', i.INTERVALO_PARTOS.PROMEDIO_DIAS, `Promedio de ${i.INTERVALO_PARTOS.INTERVALOS} intervalos entre partos seguidos de la misma vaca`],
      ['Leche total (L)', i.LECHE.LITROS_TOTALES, `${i.LECHE.DIAS_CON_ORDENO} días con ordeño`],
      ['Litros por vaca al día', i.LECHE.LITROS_VACA_DIA, 'Promedio, entre los días con ordeño, de los litros del día / vacas ordeñadas ese día'],
      ['Ganancia de peso (g/día)', i.GANANCIA_PESO.GRAMOS_DIA, `${i.GANANCIA_PESO.ANIMALES} animales con dos pesajes en el periodo separados al menos 14 días: (último - primero) / días`],
      ['Ventas (cantidad)', i.VENTAS.CANTIDAD, ''],
      ['Ventas (valor $)', i.VENTAS.VALOR_TOTAL, ''],
    ];
    filas.forEach(f => hi.addRow([f[0], f[1] ?? 'Sin datos', f[2]]));
    hi.getColumn(2).alignment = { horizontal: 'right' };
    hi.addRow([]);
    hi.addRow(['Hato por categoría (hoy)']).font = { bold: true };
    i.HATO_POR_CATEGORIA.forEach(c => hi.addRow([c.CATEGORIA, c.CANTIDAD]));
  } else {
    hi.addRow(['Los indicadores salen después de consultarlos con señal.']);
  }

  //2. HATO
  hoja('Hato', [
    { header: 'Chapeta', key: 'chapeta', width: 12 }, { header: 'Nombre', key: 'nombre', width: 18 },
    { header: 'Sexo', key: 'sexo', width: 8 }, { header: 'Categoría', key: 'categoria', width: 12 },
    { header: 'Raza', key: 'raza', width: 16 }, { header: 'Lote', key: 'lote', width: 16 },
    { header: 'Nacimiento', key: 'nacimiento', width: 12 }, { header: 'Origen', key: 'origen', width: 10 },
    { header: 'Madre', key: 'madre', width: 12 }, { header: 'Padre', key: 'padre', width: 14 },
    { header: 'Peso actual (kg)', key: 'peso', width: 14 }, { header: 'Último pesaje', key: 'pesaje', width: 13 },
    { header: 'Estado', key: 'estado', width: 11 }, { header: 'Salida', key: 'salida', width: 12 },
    { header: 'Pendiente', key: 'pend', width: 10 },
  ], [...d.animales].sort((a, b) => (a.CHAPETA_ANIMAL ?? '').localeCompare(b.CHAPETA_ANIMAL ?? '', 'es', { numeric: true })).map(a => ({
    chapeta: a.CHAPETA_ANIMAL ?? '', nombre: a.NOM_ANIMAL ?? '', sexo: a.SEXO_ANIMAL === 'H' ? 'Hembra' : 'Macho',
    categoria: categoriaAnimal(a, madres.has(a.UUID_ANIMAL)), raza: a.ID_RAZA ? (razas.get(a.ID_RAZA) ?? '') : '',
    lote: a.UUID_LOTE ? (lotes.get(a.UUID_LOTE) ?? '') : '', nacimiento: fecha(a.FECHA_NACIMIENTO),
    origen: a.ORIGEN_ANIMAL === 'NACIDO' ? 'Nacido' : 'Comprado', madre: chapeta(a.UUID_MADRE),
    padre: a.UUID_PADRE ? chapeta(a.UUID_PADRE) : (a.PADRE_EXTERNO ?? ''), peso: numero(a.PESO_ACTUAL_KG),
    pesaje: fecha(a.FECHA_ULTIMO_PESAJE), estado: a.ESTADO_ANIMAL.charAt(0) + a.ESTADO_ANIMAL.slice(1).toLowerCase(),
    salida: fecha(a.FECHA_SALIDA_ANIMAL), pend: pendiente(a),
  })));

  //3. PESAJES
  hoja('Pesajes', [
    { header: 'Fecha', key: 'fecha', width: 12 }, { header: 'Chapeta', key: 'chapeta', width: 12 },
    { header: 'Peso (kg)', key: 'peso', width: 11 }, { header: 'Con cinta', key: 'cinta', width: 10 },
    { header: 'Perímetro (cm)', key: 'perimetro', width: 14 }, { header: 'Observación', key: 'obs', width: 30 },
    { header: 'Pendiente', key: 'pend', width: 10 },
  ], [...d.pesajes].sort((a, b) => b.FECHA_EVENTO.localeCompare(a.FECHA_EVENTO)).map(p => ({
    fecha: fecha(p.FECHA_EVENTO), chapeta: chapeta(p.UUID_ANIMAL), peso: numero(p.PESO_KG), cinta: p.ESTIMADO_CINTA === 'SI' ? 'Sí' : 'No',
    perimetro: numero(p.PERIMETRO_CM), obs: p.OBSERVACION_PESAJE ?? '', pend: pendiente(p),
  })));

  //4. ORDEÑOS
  hoja('Ordeños', [
    { header: 'Fecha', key: 'fecha', width: 12 }, { header: 'Jornada', key: 'jornada', width: 10 },
    { header: 'Chapeta', key: 'chapeta', width: 12 }, { header: 'Litros', key: 'litros', width: 9 },
    { header: 'Observación', key: 'obs', width: 30 }, { header: 'Pendiente', key: 'pend', width: 10 },
  ], [...d.ordenos].sort((a, b) => b.FECHA_EVENTO.localeCompare(a.FECHA_EVENTO)).map(o => ({
    fecha: fecha(o.FECHA_EVENTO), jornada: o.JORNADA_ORDENO === 'MANANA' ? 'Mañana' : 'Tarde', chapeta: chapeta(o.UUID_ANIMAL),
    litros: numero(o.LITROS_ORDENO), obs: o.OBSERVACION_ORDENO ?? '', pend: pendiente(o),
  })));

  //5. SANIDAD (VACUNACIONES)
  hoja('Sanidad', [
    { header: 'Fecha', key: 'fecha', width: 12 }, { header: 'Chapeta', key: 'chapeta', width: 12 },
    { header: 'Vacuna o medicamento', key: 'vacuna', width: 24 }, { header: 'Dosis', key: 'dosis', width: 12 },
    { header: 'Próxima dosis', key: 'proxima', width: 13 }, { header: 'Sin vender leche hasta', key: 'retiro', width: 20 },
    { header: 'Observación', key: 'obs', width: 30 }, { header: 'Pendiente', key: 'pend', width: 10 },
  ], [...d.vacunaciones].sort((a, b) => b.FECHA_EVENTO.localeCompare(a.FECHA_EVENTO)).map(v => ({
    fecha: fecha(v.FECHA_EVENTO), chapeta: chapeta(v.UUID_ANIMAL), vacuna: vacunas.get(v.ID_VACUNA) ?? '', dosis: v.DOSIS_VACUNACION ?? '',
    proxima: fecha(v.FECHA_PROXIMA_DOSIS), retiro: fecha(v.FECHA_FIN_RETIRO), obs: v.OBSERVACION_VACUNACION ?? '', pend: pendiente(v),
  })));

  //6. REPRODUCCION (SERVICIOS, PALPACIONES Y PARTOS EN UNA SOLA LISTA POR FECHA)
  const repro = [
    ...d.servicios.map(s => ({ f: s.FECHA_EVENTO, evento: s.TIPO_SERVICIO === 'MONTA' ? 'Monta' : 'Inseminación', chapeta: chapeta(s.UUID_ANIMAL),
      detalle: s.UUID_TORO ? 'Toro ' + chapeta(s.UUID_TORO) : (s.TORO_EXTERNO ?? ''), obs: s.OBSERVACION_SERVICIO ?? '', pend: pendiente(s) })),
    ...d.palpaciones.map(p => ({ f: p.FECHA_EVENTO, evento: 'Palpación', chapeta: chapeta(p.UUID_ANIMAL),
      detalle: p.RESULTADO_PALPACION === 'PRENIADA' ? 'Preñada' + (p.MESES_GESTACION ? `, ${p.MESES_GESTACION} meses` : '') : 'Vacía',
      obs: p.OBSERVACION_PALPACION ?? '', pend: pendiente(p) })),
    ...d.partos.map(p => ({ f: p.FECHA_EVENTO, evento: 'Parto', chapeta: chapeta(p.UUID_ANIMAL),
      detalle: `${TEXTO_PARTO[p.TIPO_PARTO] ?? p.TIPO_PARTO} · ${p.CRIA_VIVA === 'SI' ? 'cría viva' + (p.SEXO_CRIA ? (p.SEXO_CRIA === 'H' ? ' (hembra)' : ' (macho)') : '') + (p.UUID_CRIA ? ' ' + chapeta(p.UUID_CRIA) : '') : 'sin cría viva'}`,
      obs: p.OBSERVACION_PARTO ?? '', pend: pendiente(p) })),
  ].sort((a, b) => b.f.localeCompare(a.f)).map(r => ({ ...r, fecha: fecha(r.f) }));
  hoja('Reproducción', [
    { header: 'Fecha', key: 'fecha', width: 12 }, { header: 'Evento', key: 'evento', width: 13 },
    { header: 'Chapeta', key: 'chapeta', width: 12 }, { header: 'Detalle', key: 'detalle', width: 34 },
    { header: 'Observación', key: 'obs', width: 30 }, { header: 'Pendiente', key: 'pend', width: 10 },
  ], repro);

  //7. SALIDAS
  const hs = hoja('Salidas', [
    { header: 'Fecha', key: 'fecha', width: 12 }, { header: 'Tipo', key: 'tipo', width: 10 },
    { header: 'Chapeta', key: 'chapeta', width: 12 }, { header: 'Valor ($)', key: 'valor', width: 14 },
    { header: 'Peso (kg)', key: 'peso', width: 10 }, { header: 'Causa', key: 'causa', width: 24 },
    { header: 'Observación', key: 'obs', width: 30 }, { header: 'Pendiente', key: 'pend', width: 10 },
  ], [...d.salidas].sort((a, b) => b.FECHA_EVENTO.localeCompare(a.FECHA_EVENTO)).map(s => ({
    fecha: fecha(s.FECHA_EVENTO), tipo: TEXTO_SALIDA[s.TIPO_SALIDA] ?? s.TIPO_SALIDA, chapeta: chapeta(s.UUID_ANIMAL),
    valor: numero(s.VALOR_SALIDA), peso: numero(s.PESO_SALIDA_KG), causa: s.CAUSA_SALIDA ?? '', obs: s.OBSERVACION_SALIDA ?? '', pend: pendiente(s),
  })));
  hs.getColumn('valor').numFmt = '#,##0';

  //DESCARGA
  const buffer = await libro.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const nombreArchivo = `${nombreFinca.replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '_') || 'finca'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return nombreArchivo;
}
