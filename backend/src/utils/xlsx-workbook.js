const archiver = require('archiver');

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeSheetName(name, fallback = 'Sheet') {
  const cleaned = String(name || fallback)
    .replace(/[\[\]\*\/\\\?:]/g, ' ')
    .trim()
    .slice(0, 31);
  return cleaned || fallback;
}

function columnName(index) {
  let value = Number(index) + 1;
  let name = '';
  while (value > 0) {
    const modulo = (value - 1) % 26;
    name = String.fromCharCode(65 + modulo) + name;
    value = Math.floor((value - modulo) / 26);
  }
  return name;
}

function cellRef(rowIndex, columnIndex) {
  return `${columnName(columnIndex)}${rowIndex + 1}`;
}

function sheetRange(sheetName, startRow, startColumn, endRow, endColumn) {
  const quotedName = `'${String(sheetName).replace(/'/g, "''")}'`;
  return `${quotedName}!$${columnName(startColumn)}$${startRow + 1}:$${columnName(endColumn)}$${endRow + 1}`;
}

function isNumericCell(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function buildCellXml(value, rowIndex, columnIndex) {
  const ref = cellRef(rowIndex, columnIndex);
  if (isNumericCell(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  if (typeof value === 'boolean') return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function buildWorksheetXml(sheet = {}, index = 0) {
  const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const maxColumns = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 1);
  const dimension = `A1:${cellRef(Math.max(rows.length - 1, 0), Math.max(maxColumns - 1, 0))}`;
  const widths = Array.isArray(sheet.widths) ? sheet.widths : [];
  const colsXml = widths.length > 0
    ? `<cols>${widths.map((width, widthIndex) => {
        const numericWidth = Number(width);
        return `<col min="${widthIndex + 1}" max="${widthIndex + 1}" width="${Number.isFinite(numericWidth) ? numericWidth : 14}" customWidth="1"/>`;
      }).join('')}</cols>`
    : '';
  const freezeRows = Number(sheet.freezeRows || 0);
  const freezeXml = freezeRows > 0
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freezeRows}" topLeftCell="A${freezeRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const rowsXml = rows.map((row, rowIndex) => {
    const cellsXml = (Array.isArray(row) ? row : []).map((value, columnIndex) =>
      buildCellXml(value, rowIndex, columnIndex)
    ).join('');
    return `<row r="${rowIndex + 1}">${cellsXml}</row>`;
  }).join('');
  const drawingXml = sheet.drawingId
    ? `<drawing r:id="rId${sheet.drawingId}"/>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="${dimension}"/>
  ${freezeXml}
  ${colsXml}
  <sheetData>${rowsXml}</sheetData>
  ${drawingXml}
</worksheet>`;
}

function buildStringCache(values = []) {
  return `<c:strCache><c:ptCount val="${values.length}"/>${values.map((value, index) =>
    `<c:pt idx="${index}"><c:v>${escapeXml(value)}</c:v></c:pt>`
  ).join('')}</c:strCache>`;
}

function buildNumberCache(values = []) {
  return `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values.map((value, index) =>
    `<c:pt idx="${index}"><c:v>${Number(value) || 0}</c:v></c:pt>`
  ).join('')}</c:numCache>`;
}

function buildChartXml(chart = {}) {
  const axisIdBase = Number(chart.axisIdBase || 100000);
  const categoryAxisId = axisIdBase + 1;
  const valueAxisId = axisIdBase + 2;
  const categories = Array.isArray(chart.categories) ? chart.categories : [];
  const values = Array.isArray(chart.values) ? chart.values : [];

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:date1904 val="0"/>
  <c:lang val="en-US"/>
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1200" b="1"/><a:t>${escapeXml(chart.title || 'Chart')}</a:t></a:r></a:p></c:rich></c:tx>
      <c:layout/>
    </c:title>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="col"/>
        <c:grouping val="clustered"/>
        <c:varyColors val="1"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          <c:tx><c:v>${escapeXml(chart.seriesName || 'Value')}</c:v></c:tx>
          <c:cat><c:strRef><c:f>${escapeXml(chart.categoryRange || '')}</c:f>${buildStringCache(categories)}</c:strRef></c:cat>
          <c:val><c:numRef><c:f>${escapeXml(chart.valueRange || '')}</c:f>${buildNumberCache(values)}</c:numRef></c:val>
        </c:ser>
        <c:axId val="${categoryAxisId}"/>
        <c:axId val="${valueAxisId}"/>
      </c:barChart>
      <c:catAx>
        <c:axId val="${categoryAxisId}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:axPos val="b"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="${valueAxisId}"/>
        <c:crosses val="autoZero"/>
        <c:auto val="1"/>
        <c:lblAlgn val="ctr"/>
        <c:lblOffset val="100"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="${valueAxisId}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:axPos val="l"/>
        <c:majorGridlines/>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="${categoryAxisId}"/>
        <c:crosses val="autoZero"/>
      </c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="r"/><c:layout/></c:legend>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
  </c:chart>
  <c:printSettings><c:headerFooter/><c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75" header="0.3" footer="0.3"/><c:pageSetup/></c:printSettings>
</c:chartSpace>`;
}

function buildDrawingXml(charts = []) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  ${charts.map((chart, index) => {
    const from = chart.from || { col: 3, row: 1 + index * 16 };
    const to = chart.to || { col: 12, row: 15 + index * 16 };
    return `<xdr:twoCellAnchor>
      <xdr:from><xdr:col>${from.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${from.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
      <xdr:to><xdr:col>${to.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${to.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
      <xdr:graphicFrame macro="">
        <xdr:nvGraphicFramePr><xdr:cNvPr id="${index + 2}" name="${escapeXml(chart.title || `Chart ${index + 1}`)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
        <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
        <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rId${index + 1}"/></a:graphicData></a:graphic>
      </xdr:graphicFrame>
      <xdr:clientData/>
    </xdr:twoCellAnchor>`;
  }).join('')}
</xdr:wsDr>`;
}

function buildWorkbookXml(sheets = []) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <fileVersion appName="xl" lastEdited="7" lowestEdited="7" rupBuild="23426"/>
  <workbookPr defaultThemeVersion="164011"/>
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="17640"/></bookViews>
  <sheets>${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets>
</workbook>`;
}

function buildWorkbookRels(sheets = []) {
  const sheetRels = sheets.map((_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRels}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`;
}

function buildContentTypes(sheets = [], chartCount = 0, drawingCount = 0) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  ${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
  ${Array.from({ length: drawingCount }, (_, index) => `<Override PartName="/xl/drawings/drawing${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join('')}
  ${Array.from({ length: chartCount }, (_, index) => `<Override PartName="/xl/charts/chart${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('')}
</Types>`;
}

function buildRootRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function buildThemeXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="BeyondBridge">
  <a:themeElements>
    <a:clrScheme name="BeyondBridge">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1F2937"/></a:dk2>
      <a:lt2><a:srgbClr val="F8FAFC"/></a:lt2>
      <a:accent1><a:srgbClr val="2563EB"/></a:accent1>
      <a:accent2><a:srgbClr val="16A34A"/></a:accent2>
      <a:accent3><a:srgbClr val="F97316"/></a:accent3>
      <a:accent4><a:srgbClr val="7C3AED"/></a:accent4>
      <a:accent5><a:srgbClr val="0891B2"/></a:accent5>
      <a:accent6><a:srgbClr val="DC2626"/></a:accent6>
      <a:hlink><a:srgbClr val="2563EB"/></a:hlink>
      <a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme>
    <a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
  </a:themeElements>
</a:theme>`;
}

function createArchiveBuffer(archive) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    archive.on('data', chunk => chunks.push(chunk));
    archive.on('warning', reject);
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.finalize();
  });
}

async function buildXlsxWorkbook({ sheets = [] } = {}) {
  const normalizedSheets = sheets.map((sheet, index) => ({
    ...sheet,
    name: sanitizeSheetName(sheet.name, `Sheet ${index + 1}`)
  }));
  const chartSheets = normalizedSheets.filter(sheet => Array.isArray(sheet.charts) && sheet.charts.length > 0);
  let chartIndex = 0;
  let drawingIndex = 0;

  chartSheets.forEach(sheet => {
    drawingIndex += 1;
    sheet.drawingId = drawingIndex;
    sheet.drawingIndex = drawingIndex;
    sheet.charts = sheet.charts.map(chart => ({
      ...chart,
      chartId: ++chartIndex,
      axisIdBase: 100000 + chartIndex * 10
    }));
  });

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.append(buildContentTypes(normalizedSheets, chartIndex, drawingIndex), { name: '[Content_Types].xml' });
  archive.append(buildRootRels(), { name: '_rels/.rels' });
  archive.append(buildWorkbookXml(normalizedSheets), { name: 'xl/workbook.xml' });
  archive.append(buildWorkbookRels(normalizedSheets), { name: 'xl/_rels/workbook.xml.rels' });
  archive.append(buildStylesXml(), { name: 'xl/styles.xml' });
  archive.append(buildThemeXml(), { name: 'xl/theme/theme1.xml' });

  normalizedSheets.forEach((sheet, index) => {
    archive.append(buildWorksheetXml(sheet, index), { name: `xl/worksheets/sheet${index + 1}.xml` });
    if (sheet.drawingId) {
      archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId${sheet.drawingId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${sheet.drawingIndex}.xml"/>
</Relationships>`, { name: `xl/worksheets/_rels/sheet${index + 1}.xml.rels` });
      archive.append(buildDrawingXml(sheet.charts), { name: `xl/drawings/drawing${sheet.drawingIndex}.xml` });
      archive.append(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheet.charts.map((chart, chartRelIndex) =>
    `<Relationship Id="rId${chartRelIndex + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chart.chartId}.xml"/>`
  ).join('')}
</Relationships>`, { name: `xl/drawings/_rels/drawing${sheet.drawingIndex}.xml.rels` });
      sheet.charts.forEach(chart => {
        archive.append(buildChartXml(chart), { name: `xl/charts/chart${chart.chartId}.xml` });
      });
    }
  });

  return createArchiveBuffer(archive);
}

module.exports = {
  buildXlsxWorkbook,
  sheetRange
};
