// Variabeln global zugänglich machen
let svg, g, width, height, projection, path;
let rScale, colorScale;
let data, world;
let circles, mapPaths;
let tooltip;
let activeCategory = null;
let previewCategory = null;
let explodedNest = null;
let previewedNest = null;
let currentZoom = 1;
const isTouch = 'ontouchstart' in window; // falls Phone oder Tablet

const pastelColors = [
    "#AEC6CF", // Babyblau
    "#FFB347", // Apricot
    "#B39EB5", // Lavendel
    "#77DD77", // Mintgrün
    "#FF6961", // Pastellrot
    "#FDFD96", // Vanillegelb
    "#CFCFC4", // Graubeige
    "#B0E0E6", // Puderblau
    "#D8BFD8", // Thistle
    "#E6E6FA", // Lavendelmix
    "#F5CBA7"  // Pfirsich
];

const zoom = d3.zoom()
  .scaleExtent([.3, 10])
  .on("zoom", (event) => {
    const transform = event.transform;
    currentZoom = transform.k; // Zoomstufe speichern
    g.attr("transform", transform);
    circles.attr("r", d => rScale(d.betrag) / transform.k); // Punktgrössen anpassen – damit sie beim Zoom gleich gross bleiben
  });

// Funktion für Force-Directed Clustering / Explode on Click / Spiderification
function spreadPoints(points, center, rScale) {
  // Klassischer Kreis-Spread
  if (points.length <= 10) {
    const angleStep = 2 * Math.PI / points.length; // teilt Kreis durch anzahl Punkte
    const baseRadius = 25 + rScale(d3.max(points, d => d.betrag)); // bestimmt den Grundradius des Spreads
    const zoomAdjustedRadius = baseRadius / currentZoom; // Spread-Radius wird an die aktuelle Zoomstufe angepasst
    return points.map((d, i) => {
      const angle = i * angleStep; // berechnet den Winkel auf dem Kreis
      d.x = center[0] + zoomAdjustedRadius * Math.cos(angle);
      d.y = center[1] + zoomAdjustedRadius * Math.sin(angle);
      return d;
    });
  } else {
    // Spiralförmiges Spread ab 11 Punkten
    const spiralSpacing = 12 / currentZoom; // Abstand zwischen Punkten
    const angleStep = 0.5; // Schrittweite im Bogenmass (kleinere Werte → engerer Spiralverlauf)
    return points.map((d, i) => {
      const angle = i * angleStep;
      const radius = spiralSpacing * angle; // logarithmisch-arithmetische Spirale
      d.x = center[0] + radius * Math.cos(angle);
      d.y = center[1] + radius * Math.sin(angle);
      return d;
    });
  }
}

// Funktion für das anpassen der Datenpunkte bei Touch-Gerät
function updateCircles() {
  circles
    .style("display", d => {
      if (activeCategory) return d.Kategorie === activeCategory ? "block" : "none";
      if (previewCategory) return d.Kategorie === previewCategory ? "block" : "none";
      return "block";
    })
    .transition().duration(200)
    .style("opacity", d => {
      if (activeCategory) return d.Kategorie === activeCategory ? 0.8 : 0;
      if (previewCategory) return d.Kategorie === previewCategory ? 0.6 : 0.1;
      return 0.7;
    });
}

// Funktion für das Zeichnen der Map und der Datenpunkte
function draw() {
  width = parseInt(d3.select("#map").style("width"));
  height = parseInt(d3.select("#map").style("height"));

  d3.select("svg").selectAll("*").remove();
  svg = d3.select("svg");

  svg.insert("rect", ":first-child")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "#0A1721");

  svg.call(zoom);
  g = svg.append("g");
  tooltip = d3.select("#tooltip");

  const coords = data.map(d => [d.lon, d.lat]);
  const bounds = d3.geoBounds({
    type: "FeatureCollection",
    features: coords.map(c => ({ type: "Feature", geometry: { type: "Point", coordinates: c } }))
  });

  const [[minLon, minLat], [maxLon, maxLat]] = bounds;
  const dx = maxLon - minLon;
  const dy = maxLat - minLat;
  const scale = 0.95 / Math.max(dx / width, dy / height);
  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;

  projection = d3.geoMercator()
    .center([centerLon, centerLat])
    .scale(scale * 20)
    .translate([width / 2, height / 2]);

  path = d3.geoPath().projection(projection);

  // Weltkarte zeichnen
  mapPaths = g.selectAll("path")
    .data(world.features)
    .enter()
    .append("path")
    .attr("d", path)
    .attr("fill", "#142F43")
    .attr("stroke", "#738693")
    .attr("stroke-width", .4);

  // Datenpunkte zeichnen
  circles = g.selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", d => projection([d.lon, d.lat])[0])
    .attr("cy", d => projection([d.lon, d.lat])[1])
    .attr("r", d => rScale(d.betrag))
    .attr("fill", d => colorScale(d.Kategorie))
    .attr("opacity", 0.8);

  if (!isTouch) { // Interaktion für Desktop-Geräte
    circles
      // bei Hover wird ein Label des Datenpunkts eingeblendet
      .on("mouseover", function(event, d) {
        tooltip.transition().duration(200).style("opacity", 0.8);
        tooltip.html(`<strong>${d.Ausgabe}</strong><br>${d.Ortschaft}<br><em>${d.Kategorie}</em><br>${d.betrag} CHF`)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      // Label bewegt sich mit der Maus mit solange über dem Datenpunkt gehovert wird
      .on("mousemove", function(event) {
        tooltip.style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      // Label wird ausgeblendet sobald Datenpunkt verlassen wird
      .on("mouseout", function() {
        tooltip.transition().duration(300).style("opacity", 0);
      })
      // bei Klick wird das Nest aufgefächert
      .on("click", function(event, clickedDatum) {
        const sameCoords = data.filter(d => d.lat === clickedDatum.lat && d.lon === clickedDatum.lon);
        if (sameCoords.length <= 1) return; // Kein Nest, nix spreaden
        const key = `${clickedDatum.lat}_${clickedDatum.lon}`;
        if (explodedNest === key) { // Bereits gespreadet? Dann zurückrollen
          explodedNest = null;
          circles.transition().duration(400)
            .attr("cx", d => projection([d.lon, d.lat])[0])
            .attr("cy", d => projection([d.lon, d.lat])[1])
            .style("opacity", 0.7);
          mapPaths.transition().duration(400).style("opacity", 1);  // Weltkarte wieder sichtbar machen
          return;
        }
        explodedNest = key; // Neues Nest auffächern
        const center = projection([clickedDatum.lon, clickedDatum.lat]);
        const spreaded = spreadPoints([...sameCoords], center, rScale);
        circles.transition().duration(300) // übrige Punkte ausgrauen
          .style("opacity", d => d.lat === clickedDatum.lat && d.lon === clickedDatum.lon ? 1 : 0.05);
        mapPaths.transition().duration(300).style("opacity", 0.1); // Weltkarte abdunkeln
        circles.filter(d => sameCoords.includes(d)) // Nestpunkte animieren
          .transition().duration(400)
          .attr("cx", d => spreaded.find(s => s === d)?.x ?? projection([d.lon, d.lat])[0])
          .attr("cy", d => spreaded.find(s => s === d)?.y ?? projection([d.lon, d.lat])[1]);
      });
  } else { // Interaktion für Touch-Geräte – Tap zum Anzeigen, 2. Tap zum Explodieren
    circles
      .on("click", function(event, clickedDatum) {
        const sameCoords = data.filter(d => d.lat === clickedDatum.lat && d.lon === clickedDatum.lon);
        if (sameCoords.length <= 1) return;
        const key = `${clickedDatum.lat}_${clickedDatum.lon}`;
        if (previewedNest === key) {
          explodedNest = key;
          previewedNest = null;
          const center = projection([clickedDatum.lon, clickedDatum.lat]);
          const spreaded = spreadPoints([...sameCoords], center, rScale);
          circles.transition().duration(300)
            .style("opacity", d => d.lat === clickedDatum.lat && d.lon === clickedDatum.lon ? 1 : 0.05);
          mapPaths.transition().duration(300).style("opacity", 0.1);
          circles.filter(d => sameCoords.includes(d))
            .transition().duration(400)
            .attr("cx", d => spreaded.find(s => s === d)?.x ?? projection([d.lon, d.lat])[0])
            .attr("cy", d => spreaded.find(s => s === d)?.y ?? projection([d.lon, d.lat])[1]);
        } else {
          tooltip.transition().duration(200).style("opacity", 0.9);
          tooltip.html(`<strong>${clickedDatum.Ausgabe}</strong><br>${clickedDatum.Ortschaft}<br><em>${clickedDatum.Kategorie}</em><br>${clickedDatum.betrag} CHF`)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
          previewedNest = key;
        }
      });
    }

  // Legende
  const legend = d3.select("svg").append("g")
    .attr("class", "legend")
    .attr("transform", `translate(30, 30)`);

  const categorySums = d3.rollups(data, v => d3.sum(v, d => d.betrag), d => d.Kategorie)
    .sort((a, b) => d3.descending(a[1], b[1]));

  const barScale = d3.scaleLinear()
    .domain([0, d3.max(categorySums, d => d[1])])
    .range([5, 200]); // min. und max. Breite des Balkens

  categorySums.forEach(([cat, sum], i) => {
    const row = legend.append("g")
      .attr("transform", `translate(0, ${i * 30})`)
      .style("cursor", "pointer"); // Zeiger-Maus für UX

    // Balken
    row.append("rect")
      .attr("width", barScale(sum))
      .attr("height", 20)
      .attr("fill", colorScale(cat))

    if (!isTouch) { // Interaktion für Desktop-Geräte
      row.on("mouseover", function(event) { // Punkte werden angepasst bei Interaktion mit Balken
        tooltip.transition().duration(200).style("opacity", 0.8);
        tooltip.html(`<strong>${cat}</strong><br>${sum.toFixed(2)} CHF`)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
        circles.style("display", d => { // nur aktuelle Kategorie zeigen, Rest ausblenden
            if (!activeCategory) return "block"; // alles anzeigen
            return (d.Kategorie === activeCategory || d.Kategorie === cat) ? "block" : "none"; // none = ausblenden der nicht angewählten Kategorie
        });
        circles.transition().duration(200) // gehoverte Kategorie wird eingeblendet
          .style("opacity", d => { // Opacity für jeden Punkt bestimmen
            if (!activeCategory) return d.Kategorie === cat ? 0.8 : 0.1;
            if (d.Kategorie === activeCategory) return 0.8;
            if (d.Kategorie === cat) return 0.5;
          });
      })
      .on("mousemove", function(event) {
        tooltip.style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseout", function() {
        tooltip.transition().duration(300).style("opacity", 0);
        circles.style("display", d => !activeCategory || d.Kategorie === activeCategory ? "block" : "none");
        circles.transition().duration(200)
          .style("opacity", d => !activeCategory || d.Kategorie === activeCategory ? 0.7 : 0);
      })
      .on("click", function() {
        activeCategory = activeCategory === cat ? null : cat;
        circles.style("display", d => !activeCategory || d.Kategorie === activeCategory ? "block" : "none");
      });
    } else { // Interaktion für Touch-Geräte
        row.on("touchstart", function(event) {
          event.preventDefault();
          if (previewCategory === cat) {
            activeCategory = cat;
            previewCategory = null;
          } else {
            previewCategory = cat;
          }
          updateCircles();
        });
      }

    // Label
    row.append("text")
      .attr("x", barScale(sum) + 8)
      .attr("y", 14)
      .attr("fill", "#c4c4cc")
      .style("font-size", "13px")
      .text(cat);
  });
  
  updateCircles();

}

// CSV und Map laden
Promise.all([
  d3.csv("data/reisekosten_cleaned.csv"),
  d3.json("data/world_50m.geojson")
]).then(([csvData, worldData]) => {
  data = csvData.map(d => ({
    ...d,
    lat: +d.lat,
    lon: +d.lon,
    betrag: +d.Betrag
  }));
  world = worldData;
  colorScale = d3.scaleOrdinal()
    .domain([...new Set(data.map(d => d.Kategorie))])
    .range(pastelColors);
  rScale = d3.scaleSqrt()
    .domain([0, d3.max(data, d => d.betrag)])
    .range([4, 20]);
  draw();
});

// Neues Ausführen der Draw-Function bei Anpassung der Fenstergrösse oder rotation des Phones
window.addEventListener("resize", () => {
  draw();
});

// Spread zurücksetzen bei Klick auf freie Fläche
d3.select("svg").on("click", function(event) {
  if (event.target.tagName !== "circle") {
    previewedNest = null;
    explodedNest = null;
    previewCategory = null;
    tooltip.transition().duration(200).style("opacity", 0);
    updateCircles();
    circles.transition().duration(400)
      .attr("cx", d => projection([d.lon, d.lat])[0])
      .attr("cy", d => projection([d.lon, d.lat])[1])
      .style("opacity", 0.7);
    mapPaths.transition().duration(400).style("opacity", 1);
  }
});