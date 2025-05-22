import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

console.log('Mapbox GL JS Loaded:', mapboxgl);

mapboxgl.accessToken = 'pk.eyJ1IjoidnNhaGp3YW5pIiwiYSI6ImNtYXltZzZ2bjA3djEycW9qeWRpd2FoYTEifQ.W8KC1oYsbEDimvmyFeNIWQ';

// Global variables
let timeFilter = -1; // Global time filter variable
let departuresByMinute = Array.from({ length: 1440 }, () => []); // Performance optimization buckets
let arrivalsByMinute = Array.from({ length: 1440 }, () => []); // Performance optimization buckets
let circles; // Global reference to circles for updates

// Global helper function to format time
function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes); // Set hours & minutes
  return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
}

// Helper function to convert Date to minutes since midnight
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// Efficient filtering function using pre-sorted buckets
function filterByMinute(tripsByMinute, minute) {
  if (minute === -1) {
    return tripsByMinute.flat(); // No filtering, return all trips
  }

  // Normalize both min and max minutes to the valid range [0, 1439]
  let minMinute = (minute - 60 + 1440) % 1440;
  let maxMinute = (minute + 60) % 1440;

  // Handle time filtering across midnight
  if (minMinute > maxMinute) {
    let beforeMidnight = tripsByMinute.slice(minMinute);
    let afterMidnight = tripsByMinute.slice(0, maxMinute);
    return beforeMidnight.concat(afterMidnight).flat();
  } else {
    return tripsByMinute.slice(minMinute, maxMinute).flat();
  }
}

// Refactored function to compute station traffic efficiently
function computeStationTraffic(stations, timeFilter = -1) {
  // Retrieve filtered trips efficiently using pre-sorted buckets
  const departures = d3.rollup(
    filterByMinute(departuresByMinute, timeFilter), // Efficient retrieval
    (v) => v.length,
    (d) => d.start_station_id
  );

  const arrivals = d3.rollup(
    filterByMinute(arrivalsByMinute, timeFilter), // Efficient retrieval
    (v) => v.length,
    (d) => d.end_station_id
  );

  // Update each station with calculated traffic values
  return stations.map((station) => {
    let id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });
}

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

  // Load trips data with date parsing and bucket sorting
  let trips;
  try {
    trips = await d3.csv(
      'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
      (trip) => {
        // Parse date strings into Date objects
        trip.started_at = new Date(trip.started_at);
        trip.ended_at = new Date(trip.ended_at);
        
        // Sort trips into time buckets for performance optimization
        let startedMinutes = minutesSinceMidnight(trip.started_at);
        let endedMinutes = minutesSinceMidnight(trip.ended_at);
        
        departuresByMinute[startedMinutes].push(trip);
        arrivalsByMinute[endedMinutes].push(trip);
        
        return trip;
      }
    );
    console.log('Loaded and processed trips data:', trips.length, 'trips');
    console.log('Departure buckets filled:', departuresByMinute.filter(bucket => bucket.length > 0).length);
    console.log('Arrival buckets filled:', arrivalsByMinute.filter(bucket => bucket.length > 0).length);
  } catch (error) {
    console.error('Error loading trips data:', error);
    return; // Exit if we can't load trips data
  }

  // Compute initial station traffic (no filtering)
  stations = computeStationTraffic(stations);
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

  // Create radius scale for circle sizes
  const radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(stations, (d) => d.totalTraffic)])
    .range([0, 25]);

  // Create circles for each station with key function for efficient updates
  circles = svg
    .selectAll('circle')
    .data(stations, (d) => d.short_name) // Use station short_name as the key for efficient updates
    .enter()
    .append('circle')
    .attr('r', d => radiusScale(d.totalTraffic)) // Radius based on traffic
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

  // Time filter elements selection
  const timeSlider = document.getElementById('timeSlider');
  const selectedTime = document.getElementById('timeDisplay');
  const anyTimeLabel = document.getElementById('anyTime');

  // Function to update the visualization based on time filter
  function updateScatterPlot(timeFilter) {
    // Recompute station traffic based on the filtered time
    const filteredStations = computeStationTraffic(stations, timeFilter);

    // Adjust radius scale range based on filtering
    timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);

    // Update the circles with new data and sizes
    circles
      .data(filteredStations, (d) => d.short_name) // Ensure D3 tracks elements correctly
      .join('circle')
      .attr('r', (d) => radiusScale(d.totalTraffic))
      .each(function (d) {
        // Update tooltips with new traffic data
        d3.select(this).select('title')
          .text(
            `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
          );
      });

    console.log('Updated visualization for time filter:', timeFilter);
  }

  // Function to update the time display and trigger visualization update
  function updateTimeDisplay() {
    timeFilter = Number(timeSlider.value); // Get slider value

    if (timeFilter === -1) {
      selectedTime.textContent = ''; // Clear time display
      anyTimeLabel.style.display = 'block'; // Show "(any time)"
    } else {
      selectedTime.textContent = formatTime(timeFilter); // Display formatted time
      anyTimeLabel.style.display = 'none'; // Hide "(any time)"
    }

    // Call updateScatterPlot to reflect the changes on the map
    updateScatterPlot(timeFilter);
  }

  // Bind slider input event and initialize
  timeSlider.addEventListener('input', updateTimeDisplay);
  updateTimeDisplay(); // Initialize display
});