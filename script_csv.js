const svgElement = document.getElementById("map");
const svg = d3.select("#map");
const width = parseInt(svg.style("width"));
const height = parseInt(svg.style("height"));

const projection = d3.geoMercator();
const path = d3.geoPath().projection(projection);

let activeCategory = null; // 👈 globaler Status
let explodedNest = null; // 👈 speichert das aktive Nest (lon+lat)
let circles; // global zugänglich machen
let rScale; // global zugänglich machen
let currentZoom = 1;

const zoom = d3.zoom()
  .scaleExtent([.3, 10])
  .on("zoom", (event) => {
    const transform = event.transform;
    currentZoom = transform.k; // 👈 Zoomstufe speichern
    g.attr("transform", transform);

    // Punktgrössen anpassen – damit sie beim Zoom gleich gross bleiben
    circles.attr("r", d => rScale(d.betrag) / transform.k);
  });

svg.insert("rect", ":first-child")
  .attr("width", width)
  .attr("height", height)
  .attr("fill", "#0A1721");

// Neu laden der Seite bei Anpassung der Fenstergrösse oder rotation des Phones
window.addEventListener("resize", () => {
  location.reload(); // simpelster Weg
});

svg.call(zoom);
    
// Gruppe für alles, was gezoomt wird
const g = svg.append("g");

let mapPaths; // 👈 Weltkarte-Paths global speichern

// Tooltip-DIV referenzieren
const tooltip = d3.select("#tooltip");

// Funktion für Force-Directed Clustering / Explode on Click / Spiderification
function spreadPoints(points, center, rScale) {
  if (points.length <= 10) {
    // Klassisches Kreis-Spread
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

// Erst CSV laden
d3.csv("data/reisekosten_cleaned.csv").then(data => {
  data.forEach(d => {
    d.lat = +d.lat;
    d.lon = +d.lon;
    d.betrag = +d.Betrag;
  });

  const coords = data.map(d => [d.lon, d.lat]);

  const bounds = d3.geoBounds({
    type: "FeatureCollection",
    features: coords.map(c => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: c }
    }))
  });

  const [[minLon, minLat], [maxLon, maxLat]] = bounds;
  const dx = maxLon - minLon;
  const dy = maxLat - minLat;
  const scale = 0.95 / Math.max(dx / width, dy / height);
  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;

  projection
    .center([centerLon, centerLat])
    .scale(scale * 20)
    .translate([width / 2, height / 2]);

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

  const colorScale = d3.scaleOrdinal()
    .domain([...new Set(data.map(d => d.Kategorie))])
    .range(pastelColors);

    // const colorScale = d3.scaleOrdinal()
    //   .domain([...new Set(data.map(d => d.Kategorie))])
    //   .range(d3.schemeTableau10);

  rScale = d3.scaleSqrt()
    .domain([0, d3.max(data, d => d.betrag)])
    .range([4, 20]);

  // Weltkarte
  d3.json("data/world_50m.geojson").then(world => {
    mapPaths = g.selectAll("path")
      .data(world.features)
      .enter()
      .append("path")
      .attr("d", path)
      .attr("fill", "#142F43")
      .attr("stroke", "#738693")
      .attr("stroke-width", .4);

    // Datenpunkte
    circles = g.selectAll("circle")
      .data(data)
      .enter()
      .append("circle")
      .attr("cx", d => projection([d.lon, d.lat])[0])
      .attr("cy", d => projection([d.lon, d.lat])[1])
      .attr("r", d => rScale(d.betrag))
      .attr("fill", d => colorScale(d.Kategorie))
      .attr("opacity", 0.7)
      .on("mouseover", function(event, d) {
        tooltip.transition().duration(200).style("opacity", 0.95);
        tooltip.html(`<strong>${d.Ausgabe}</strong><br>${d.Ortschaft}<br><em>${d.Kategorie}</em><br>${d.betrag} CHF`)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      .on("mousemove", function(event) {
        tooltip.style("left", (event.pageX + 10) + "px")
              .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseout", function() {
        tooltip.transition().duration(300).style("opacity", 0);
      })
      .on("click", function(event, clickedDatum) {
        const sameCoords = data.filter(d =>
          d.lat === clickedDatum.lat && d.lon === clickedDatum.lon
        );

        if (sameCoords.length <= 1) return; // Kein Nest, nix spreaden

        const key = `${clickedDatum.lat}_${clickedDatum.lon}`;

        // 👉 Bereits gespreadet? Dann zurückrollen
        if (explodedNest === key) {
          explodedNest = null;

          // Punkte zurück an Original-Position und normale Sichtbarkeit
          circles
            .transition()
            .duration(400)
            .attr("cx", d => projection([d.lon, d.lat])[0])
            .attr("cy", d => projection([d.lon, d.lat])[1])
            .style("opacity", 0.7);

          // Weltkarte wieder sichtbar machen
          mapPaths.transition().duration(400)
            .style("opacity", 1);
          
          return;
        }

        // 👉 Neues Nest explodieren lassen
        explodedNest = key;

        const center = projection([clickedDatum.lon, clickedDatum.lat]);
        const spreaded = spreadPoints([...sameCoords], center, rScale);

        // Alle Punkte ausgrauen
        circles
          .transition()
          .duration(300)
          .style("opacity", d =>
            d.lat === clickedDatum.lat && d.lon === clickedDatum.lon ? 1 : 0.05
          );
        
        // Weltkarte abdunkeln
        mapPaths.transition().duration(300)
          .style("opacity", 0.1);


        // Nestpunkte animieren
        circles
          .filter(d => sameCoords.includes(d))
          .transition()
          .duration(400)
          .attr("cx", d => {
            const match = spreaded.find(s => s === d);
            return match ? match.x : projection([d.lon, d.lat])[0];
          })
          .attr("cy", d => {
            const match = spreaded.find(s => s === d);
            return match ? match.y : projection([d.lon, d.lat])[1];
          });
      });

    // Legende
    const legend = d3.select("svg").append("g")
      .attr("class", "legend")
      .attr("transform", `translate(30, 30)`);

    const categorySums = d3.rollups(
      data,
      v => d3.sum(v, d => d.betrag),
      d => d.Kategorie
    )
    .sort((a, b) => d3.descending(a[1], b[1]));

    const legendWidthMax = 200; // max. Breite des Balkens
    const legendWidthMin = 5; // min. Breite des Balkens
    const barScale = d3.scaleLinear()
      .domain([0, d3.max(categorySums, d => d[1])])
      .range([legendWidthMin, legendWidthMax]);

    categorySums.forEach(([cat, sum], i) => {
      const row = legend.append("g")
        .attr("transform", `translate(0, ${i * 30})`)
        .style("cursor", "pointer") // Zeiger-Maus für UX

      // Balken
      row.append("rect")
        .attr("width", barScale(sum))
        .attr("height", 20)
        .attr("fill", colorScale(cat))
        .on("mouseover", function(event) {
          tooltip.transition().duration(200).style("opacity", 0.95);
          tooltip.html(`<strong>${cat}</strong><br>${sum.toFixed(2)} CHF`)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");

          // 👉 Highlight: nur aktuelle Kategorie normal
          circles.transition().duration(200)
            .style("opacity", d => d.Kategorie === cat ? 0.8 : 0.1);
        })
        .on("mousemove", function(event) {
          tooltip.style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function() {
          tooltip.transition().duration(300).style("opacity", 0);

          // 👉 Reset: alle Punkte wieder sichtbar
          circles.transition().duration(200)
            .style("opacity", 0.7);
        })
        .on("click", function() {
          if (activeCategory === cat) {
            // Toggle zurück zu allen
            activeCategory = null;
            circles.style("display", "block");
          } else {
            activeCategory = cat;
            circles.style("display", d => d.Kategorie === cat ? "block" : "none");
          }
        });

      // Label
      row.append("text")
        .attr("x", barScale(sum) + 8)
        .attr("y", 14)
        .attr("fill", "#c4c4cc")
        .style("font-size", "13px")
        .text(cat);
    });
  });
});

svg.on("click", function(event) {
  // Wenn das Target NICHT ein Kreis ist → Spread zurücknehmen
  if (event.target.tagName !== "circle") {
    explodedNest = null;

    circles
      .transition()
      .duration(400)
      .attr("cx", d => projection([d.lon, d.lat])[0])
      .attr("cy", d => projection([d.lon, d.lat])[1])
      .style("opacity", 0.7);
    
    mapPaths.transition().duration(400)
      .style("opacity", 1);
  }
});