import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

console.log('Mapbox GL JS Loaded:', mapboxgl);

mapboxgl.accessToken = 'pk.eyJ1IjoidnNhaGp3YW5pIiwiYSI6ImNtYXltZzZ2bjA3djEycW9qeWRpd2FoYTEifQ.W8KC1oYsbEDimvmyFeNIWQ';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});

const bikeLineStyle = {
  'line-color': '#32D400',  // A bright green using hex code
  'line-width': 5,          // Thicker lines
  'line-opacity': 0.6       // Slightly less transparent
};

// Wait for the map to load before adding data
map.on('load', async () => {
  // Add Boston bike lanes data source
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });

  // Add Boston bike lanes layer
  map.addLayer({
    id: 'boston-bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: bikeLineStyle,
  });

  // Add Cambridge bike lanes data source
  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Transportation/Bike_Facilities/TRANSPORTATION_BikeFacilities.geojson',
  });

  // Add Cambridge bike lanes layer
  map.addLayer({
    id: 'cambridge-bike-lanes',
    type: 'line',
    source: 'cambridge_route',
    paint: bikeLineStyle,
  });

  let jsonData;
  let stations;
  try {
    const jsonurl = "https://dsc106.com/labs/lab07/data/bluebikes-stations.json";
    
    // Await JSON fetch
    jsonData = await d3.json(jsonurl);
    console.log('Loaded JSON Data:', jsonData); // Log to verify structure
    
    // Access the nested stations array
    stations = jsonData.data.stations;
    console.log('Stations Array:', stations);
    
  } catch (error) {
    console.error('Error loading JSON:', error); // Handle errors
    return; // Exit if we can't load station data
  }

  // Load trips data
  let trips;
  try {
    trips = await d3.csv("https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv");
    console.log('Loaded trips data:', trips);
  } catch (error) {
    console.error('Error loading trips data:', error);
    return; // Exit if we can't load trips data
  }

  // Calculate arrivals using d3.rollup
  const arrivals = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.end_station_id,
  );

  // Calculate departures using d3.rollup
  const departures = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.start_station_id,
  );

  // Add arrivals, departures, and totalTraffic properties to each station
  stations = stations.map((station) => {
    let id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });

  console.log('Stations with traffic data:', stations);

  // Create SVG overlay for station markers
  const svg = d3.select('#map')
    .append('svg')
    .style('position', 'absolute')
    .style('top', 0)
    .style('left', 0)
    .style('width', '100%')
    .style('height', '100%')
    .style('pointer-events', 'none');

  // Function to convert lat/lon to pixel coordinates
  function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
    const { x, y } = map.project(point); // Project to pixel coordinates
    return { cx: x, cy: y }; // Return as object for use in SVG attributes
  }

  const radiusScale = d3
  .scaleSqrt()
  .domain([0, d3.max(stations, (d) => d.totalTraffic)])
  .range([0, 25]);

  // Create circles for each station
  const circles = svg
    .selectAll('circle')
    .data(stations)
    .enter()
    .append('circle')
    .attr('r', d => radiusScale(d.totalTraffic)) // Radius of the circle
    .attr('fill', 'steelblue') // Circle fill color
    .attr('stroke', 'white') // Circle border color
    .attr('stroke-width', 1) // Circle border thickness
    .attr('opacity', 0.8) // Circle opacity
    .style('pointer-events', 'auto') // Enable pointer events for tooltips
    .each(function (d) {
      // Add <title> for browser tooltips
      d3.select(this)
        .append('title')
        .text(
          `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
        );
    });

  // Function to update circle positions
  function updatePositions() {
    circles
      .attr('cx', (d) => getCoords(d).cx) // Set the x-position using projected coordinates
      .attr('cy', (d) => getCoords(d).cy); // Set the y-position using projected coordinates
  }

  // Initial position update
  updatePositions();
  
  // Update positions when map moves, zooms, or resizes
  map.on('move', updatePositions);
  map.on('zoom', updatePositions);
  map.on('resize', updatePositions);
  map.on('moveend', updatePositions);
});
