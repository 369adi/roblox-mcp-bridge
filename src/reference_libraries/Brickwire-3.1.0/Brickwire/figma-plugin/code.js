// Brickwire Figma plugin: sends the selected frame (layer tree + PNG previews) to the Brickwire app on this computer.
figma.showUI(__html__, { width: 340, height: 300, themeColors: true });

var RASTER = { VECTOR: 1, BOOLEAN_OPERATION: 1, STAR: 1, LINE: 1, POLYGON: 1, REGULAR_POLYGON: 1 };
function inv(m) { // inverse of a 2x3 affine transform
  var a = m[0][0], b = m[0][1], c = m[0][2], d = m[1][0], e = m[1][1], f = m[1][2], det = a * e - b * d;
  if (!det) return null;
  return [[e / det, -b / det, (b * f - e * c) / det], [-d / det, a / det, (d * c - a * f) / det]];
}
function handles(t) {
  var i = inv(t); if (!i) return undefined;
  function ap(x, y) { return { x: i[0][0] * x + i[0][1] * y + i[0][2], y: i[1][0] * x + i[1][1] * y + i[1][2] }; }
  return [ap(0, 0.5), ap(1, 0.5)];
}
function paints(p) {
  if (!p || p === figma.mixed || !p.length) return [];
  var out = [];
  for (var k = 0; k < p.length; k++) {
    var x = p[k];
    out.push({
      type: x.type, visible: x.visible, opacity: x.opacity,
      color: x.color ? { r: x.color.r, g: x.color.g, b: x.color.b, a: 1 } : undefined,
      gradientStops: x.gradientStops ? x.gradientStops.map(function (s) { return { position: s.position, color: s.color }; }) : undefined,
      gradientHandlePositions: x.gradientTransform ? handles(x.gradientTransform) : undefined,
      scaleMode: x.scaleMode
    });
  }
  return out;
}
function box(n) {
  if (n.absoluteBoundingBox) return n.absoluteBoundingBox;
  if (n.absoluteTransform) return { x: n.absoluteTransform[0][2], y: n.absoluteTransform[1][2], width: n.width, height: n.height };
  return null;
}
function needsRaster(o) {
  if (RASTER[o.type]) return true;
  return (o.fills || []).some(function (f) { return f.type === "IMAGE" && f.visible !== false; });
}
function norm(n, st) {
  st.n++;
  var o = { id: n.id, name: n.name, type: n.type, visible: n.visible, opacity: "opacity" in n ? n.opacity : 1, absoluteBoundingBox: box(n) };
  if ("fills" in n) o.fills = paints(n.fills);
  if ("strokes" in n) o.strokes = paints(n.strokes);
  if ("strokeWeight" in n && n.strokeWeight !== figma.mixed) o.strokeWeight = n.strokeWeight;
  if ("cornerRadius" in n) {
    if (n.cornerRadius !== figma.mixed) o.cornerRadius = n.cornerRadius;
    else o.rectangleCornerRadii = [n.topLeftRadius, n.topRightRadius, n.bottomRightRadius, n.bottomLeftRadius];
  }
  if ("clipsContent" in n) o.clipsContent = n.clipsContent;
  if ("rotation" in n) o.rotation = n.rotation;
  if ("isMask" in n) o.isMask = n.isMask;
  if ("effects" in n && n.effects !== figma.mixed) o.effects = n.effects.map(function (e) { return { type: e.type, visible: e.visible }; });
  if (n.type === "TEXT") {
    o.characters = n.characters;
    var has = n.characters.length > 0;
    var size = n.fontSize === figma.mixed ? (has ? n.getRangeFontSize(0, 1) : 14) : n.fontSize;
    var font = n.fontName === figma.mixed ? (has ? n.getRangeFontName(0, 1) : { family: "Inter", style: "Regular" }) : n.fontName;
    var weight = n.fontWeight === figma.mixed ? (has && n.getRangeFontWeight ? n.getRangeFontWeight(0, 1) : 400) : n.fontWeight;
    o.style = { fontFamily: font.family, fontPostScriptName: font.style, fontWeight: weight, fontSize: size, textAlignHorizontal: n.textAlignHorizontal, textAlignVertical: n.textAlignVertical };
    o.fills = paints(n.fills === figma.mixed ? (has ? n.getRangeFills(0, 1) : []) : n.fills);
  }
  if ("children" in n && !needsRaster(o) && st.n < 3000) o.children = n.children.map(function (c) { return norm(c, st); });
  return o;
}
function collect(o, out) {
  if (o.visible === false) return out;
  if (needsRaster(o)) { out.push(o.id); return out; }
  (o.children || []).forEach(function (c) { collect(c, out); });
  return out;
}
function selection() {
  var sel = figma.currentPage.selection;
  return sel.length ? sel[0] : null;
}
function report() {
  var n = selection();
  figma.ui.postMessage({ type: "selection", name: n ? n.name : null, kind: n ? n.type : null, size: n ? Math.round(n.width) + "×" + Math.round(n.height) : "" });
}
figma.on("selectionchange", report);
figma.ui.onmessage = async function (msg) {
  if (msg.type === "ready") return report();
  if (msg.type !== "collect") return;
  var node = selection();
  if (!node) { figma.ui.postMessage({ type: "error", text: "Select a frame first" }); return; }
  try {
    figma.ui.postMessage({ type: "status", text: "Reading layers…" });
    var root = norm(node, { n: 0 });
    var ids = collect(root, []).filter(function (id) { return id !== root.id; }).slice(0, 300);
    var images = {};
    for (var i = 0; i < ids.length; i++) {
      figma.ui.postMessage({ type: "status", text: "Exporting images " + (i + 1) + "/" + ids.length });
      var nd = await figma.getNodeByIdAsync(ids[i]);
      if (nd && "exportAsync" in nd) { try { images[ids[i]] = figma.base64Encode(await nd.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } })); } catch (e) { /* skip */ } }
    }
    figma.ui.postMessage({ type: "status", text: "Rendering preview…" });
    var big = Math.max(node.width, node.height);
    var png = figma.base64Encode(await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: big > 2400 ? 0.5 : 1 } }));
    figma.ui.postMessage({ type: "payload", payload: { root: root, images: images, png: png, fileName: figma.root.name } });
  } catch (e) {
    figma.ui.postMessage({ type: "error", text: String(e && e.message || e) });
  }
};
