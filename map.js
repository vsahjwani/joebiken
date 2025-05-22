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
    try {
        const jsonurl = "https://dsc106.com/labs/lab07/data/bluebikes-stations.json";
        
        // Await JSON fetch
        const jsonData = await d3.json(jsonurl);
        console.log('Loaded JSON Data:', jsonData); // Log to verify structure
        } catch (error) {
            console.error('Error loading JSON:', error); // Handle errors
        }
  });

let stations = jsonData.data.stations;
console.log('Stations Array:', stations);

const svg = d3.select('#map').select('svg');
function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat); //Convert lon/lat to Mapbox LngLat
    const { x, y } = map.project(point); // Project to pixel coordinates
    return { cx: x, cy: y }; // Return as object for use in SVG attributes
}

const circles = svg
  .selectAll('circle')
  .data(stations)
  .enter()
  .append('circle')
  .attr('r', 5) // Radius of the circle
  .attr('fill', 'steelblue') // Circle fill color
  .attr('stroke', 'white') // Circle border color
  .attr('stroke-width', 1) // Circle border thickness
  .attr('opacity', 0.8); // Circle opacity

  function updatePositions() {
    circles
      .attr('cx', (d) => getCoords(d).cx) // Set the x-position using projected coordinates
      .attr('cy', (d) => getCoords(d).cy); // Set the y-position using projected coordinates
  }

  updatePositions();
  map.on('move', updatePositions); // Update during map movement
  map.on('zoom', updatePositions); // Update during zooming
  map.on('resize', updatePositions); // Update on window resize
  map.on('moveend', updatePositions); // Final adjustment after movement