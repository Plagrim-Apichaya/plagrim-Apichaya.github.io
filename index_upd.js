/**
 * Customize this impact tool by filling in the following values to match your data
 */
const config = {
  /**
   * Replace this with your Mapbox Access Token (**Do this first!**)
   */
  accessToken:
    "pk.eyJ1IjoicGxhZ3JpbSIsImEiOiJja3pkNHZ0NTEydWdjMnVueDJuNDkza2ozIn0.LXogQBOOqA0Gosr5fxN98A",
  /**
   * Replace with the url of your map style
   */
  mapStyle: "mapbox://styles/plagrim/cl1xtnu4f000n14o72f8bxa4p",
  /**
   * The layer within the vector tileset to use for querying
   */
  sourceLayer: "lao-pop-2019",
  /**
   * This sets the title in the sidebar and the <title> tag of the app
   */
  title: "Laotian Population 2019",
  /**
   * This sets the description in the sidebar
   */
  description: "Context",
  /**
   * Data fields to chart from the source data
   */
  fields: ["TPOP"],
  /**
   * Labels for the X Axis, one for each field
   */
  labels: ["Population 2019"],
  /**
   * The name of the data field to pull the place name from for chart labeling ("Total Votes in placeNameField, placeAdminField")
   */
  placeNameField: "Province",
  /**
   * (_Optional_) The name of the administrative unit field to use in chart labeling ("Total Votes in placeNameField, placeAdminField")
   */

  dataSeriesLabel: "Population",
  /**
   * Basic implementation of zooming to a clicked feature
   */
  zoomToFeature: true,
  /**
   * Color to highlight features on map on click
   * TODO: add parameter for fill color too?
   */
  highlightColor: "#ff0000",
  /**
   * (_Optional_) Set this to 'bar' for a bar chart, default is line
   */
  chartType: "bar",
  /**
   * The name of the vector source, leave as composite if using a studio style,
   * change if loading a tileset programmatically
   */
  sourceId: "composite"
};

/********************************************************************************
 * Don't edit below here unless you want to customize things further
 */
/**
 * Disable this function if you edit index.html directly
 */
(updateText = () => {
  document.title = config.title;
  document.getElementById("sidebar-title").textContent = config.title;
  document.getElementById("sidebar-description").innerHTML = config.description;
})();

/**
 * We use C3 for charts, a layer on top of D3. For docs and examples: https://c3js.org/
 */
const chart = c3.generate({
  bindto: "#chart",
  data: {
    // TODO make the initial chart have as many points as the number of fields
    columns: [["data"]],
    names: { data: config.dataSeriesLabel },
    // To make a bar chart uncomment this line
    type: config.chartType ? config.chartType : "bar"
  },
  axis: {
    x: {
      type: "category",
      categories: config.labels
    }
  },
  size: {
    height: 300
  }
});

let summaryData = [];
document.getElementById("resetButton").onclick = () => {
  if (summaryData) {
    updateChartFromFeatures(summaryData);
    highlightFeature();
  }
  if (bbFull) {
    map.fitBounds(bbFull);
  }
};
// For tracking usage of our templates
const transformRequest = (url, resourceType) => {
  var isMapboxRequest =
    url.slice(8, 22) === "api.mapbox.com" ||
    url.slice(10, 26) === "tiles.mapbox.com";
  return {
    url: isMapboxRequest ? url.replace("?", "?pluginName=charts&") : url
  };
};
mapboxgl.accessToken = config.accessToken;
const map = new mapboxgl.Map({
  container: "map",
  style: config.mapStyle,
  // Change this if you want to zoom out further
  minZoom: 8.12,
  transformRequest
});

let bbFull;
map.once("idle", (idleEvent) => {
  bbFull = map.getBounds();

  buildLegend();

  /** Layer for onClick highlights, to change to a fill see this tutorial: https://docs.mapbox.com/mapbox-gl-js/example/hover-styles/ */
  map.addLayer({
    id: "highlight",
    type: "line",
    source: "composite",
    "source-layer": config.sourceLayer,
    paint: {
      "line-color": config.highlightColor,
      "line-width": 2,
      "line-opacity": [
        "case",
        ["boolean", ["feature-state", "active"], false],
        0.7,
        0
      ]
    }
  });
  map.on("click", onMapClick);
  /**
   * 'In contrast to Map#queryRenderedFeatures, this function returns all features matching the query parameters,
   * whether or not they are rendered by the current style (i.e. visible). The domain of the query includes all
   * currently-loaded vector tiles and GeoJSON source tiles: this function does not check tiles outside the currently visible viewport.'
   * https://docs.mapbox.com/mapbox-gl-js/api/map/#map#querysourcefeatures
   *
   * To graph all features within the viewport, change this to queryRenderedFeatures and trigger on 'idle' or 'render'
   * */
  const sourceFeatures = map.querySourceFeatures(config.sourceId, {
    sourceLayer: config.sourceLayer
  });
  processSourceFeatures(sourceFeatures);
});

const onMapClick = (e) => {
  const clickedFeature = map
    .queryRenderedFeatures(e.point)
    .filter((item) => item.layer["source-layer"] === config.sourceLayer)[0];
  if (clickedFeature) {
    if (config.zoomToFeature) {
      const bb = turf.bbox(clickedFeature.geometry);
      map.fitBounds(bb, {
        padding: 150
      });
    }
    highlightFeature(clickedFeature.id);
    updateChartFromClick(clickedFeature);
  }
};

const processSourceFeatures = (features) => {
  const uniqueFeatures = filterDuplicates(features);

  const data = uniqueFeatures.reduce(
    (acc, current) => {
      config.fields.forEach((field, idx) => {
        acc[idx] += current.properties[field];
      });
      return acc;
    },
    config.fields.map(() => 0)
  );

  // Save the queried data for resetting later
  if (config.summaryType === "avg") {
    summaryData = data.map((i) => i / uniqueFeatures.length);
  } else {
    summaryData = data;
  }
  updateChartFromFeatures(summaryData);
};

let activeFeatureId;
const highlightFeature = (id) => {
  if (activeFeatureId) {
    map.setFeatureState(
      {
        source: config.sourceId,
        sourceLayer: config.sourceLayer,
        id: activeFeatureId
      },
      { active: false }
    );
  }
  if (id) {
    map.setFeatureState(
      {
        source: config.sourceId,
        sourceLayer: config.sourceLayer,
        id
      },
      { active: true }
    );
  }
  activeFeatureId = id;
};
// Because tiled features can be split along tile boundaries we must filter out duplicates
// https://docs.mapbox.com/mapbox-gl-js/api/map/#map#querysourcefeatures
const filterDuplicates = (features) => {
  return Array.from(new Set(features.map((item) => item.id))).map((id) => {
    return features.find((a) => a.id === id);
  });
};

const updateChartFromFeatures = (features) => {
  chart.load({
    columns: [["data"].concat(features)],
    names: { data: `${config.dataSeriesLabel}` }
  });
};

/**
 * This function takes in the clicked feature and builds a data object for the chart using fields
 * specified in the config object.
 * @param {Object} feature
 */
const updateChartFromClick = (feature) => {
  const data = config.fields.reduce((acc, field) => {
    acc.push(feature.properties[field]);
    return acc;
  }, []);

  chart.load({
    columns: [["data"].concat(data)],
    names: {
      // Update this to match data fields if you don't have the same data schema, it will look for `name` and `state_abbrev` fields
      data: config.placeAdminField
        ? `${config.dataSeriesLabel} in ${
            feature.properties[config.placeNameField]
          }, ${feature.properties[config.placeAdminField]}`
        : `${config.dataSeriesLabel} in ${
            feature.properties[config.placeNameField]
          }`
    }
  });
};

/**
 * Builds out a legend from the viz layer
 */
const buildLegend = () => {
  const legend = document.getElementById("legend");
  const legendColors = document.getElementById("legend-colors");
  const legendValues = document.getElementById("legend-values");

  if (config.autoLegend) {
    legend.classList.add("block-ml");
    const style = map.getStyle();
    const layer = style.layers.find((i) => i.id === config.studioLayerName);
    const fill = layer.paint["fill-color"];
    // Remove the interpolate expression to get the stops
    const stops = fill.slice(3);
    stops.forEach((stop, index) => {
      // Every other value is a value, and then a color. Only iterate over the values
      if (index % 2 === 0) {
        // Default to 1 decimal unless specified in config
        const valueEl = `<div class='col align-center'>${stop.toFixed(
          typeof config.autoLegendDecimals !== "undefined"
            ? config.autoLegendDecimals
            : 1
        )}</div>`;
        const colorEl = `<div class='col h12' style='background-color:${
          stops[index + 1]
        }'></div>`;
        legendColors.innerHTML += colorEl;
        legendValues.innerHTML += valueEl;
      }
    });
  } else if (config.legendValues) {
    legend.classList.add("block-ml");
    config.legendValues.forEach((stop, idx) => {
      const key = `<div class='col h12' style='background-color:${config.legendColors[idx]}'></div>`;
      const value = `<div class='col align-center'>${stop}</div>`;
      legendColors.innerHTML += key;
      legendValues.innerHTML += value;
    });
  }
};
