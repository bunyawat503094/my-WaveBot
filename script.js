// Display Leaflet.js Map
const map = L.map("map").setView([7.180, 100.620], 13);

// Satellite and Terrain Map Layers
var satellite = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
  subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
});

var terrain = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');

L.control.layers({
  "Satellite": satellite,
  "Terrain": terrain
}).addTo(map);

satellite.addTo(map);  // Default map

// Initial Wave Level Data
let waveData = [1.0, 1.2, 1.5, 1.8, 2.0, 2.3, 2.6];
let labels = ["10:00", "10:10", "10:20", "10:30", "10:40", "10:50", "11:00"];

// Get <canvas> Element for Chart
const ctx = document.getElementById("waveChart").getContext("2d");

// Create Chart with Chart.js
const waveChart = new Chart(ctx, {
    type: "line",
    data: {
        labels: labels,
        datasets: [{
            label: "Wave Level (meters)",
            data: waveData,
            borderColor: "blue",
            borderWidth: 2,
            fill: false
        }]
    },
    options: {
        responsive: true,
        scales: {
            y: { beginAtZero: true, max: 3 }
        }
    }
});

// Variable to Store Danger Zone and Marker
let dangerZone = null;
let warningZone = null;
let marker = L.marker([7.185, 100.625]).addTo(map);  // Marker on sea

// Function to Send Telegram Alert
async function sendTelegramAlert(message) {
    const botToken = "7840021398:AAHDQat7VCGCq0I0U6t3qEEVfltm8O311Jg";  // ใส่ Bot Token ของคุณ
    const chatId = "7605322808";  // ใส่ Chat ID ของคุณ
    const url = `https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(message)}`;

    try {
        let response = await fetch(url);
        let result = await response.json();
        console.log("Telegram Alert Sent:", result);
    } catch (error) {
        console.error("Error sending Telegram alert:", error);
    }
}

// Wave Level History and Prediction
let waveHistory = [];
let predictionTime = null;

// Function to Update Wave Level Data Every 5 Seconds
function updateWaveData() {
    let newWaveHeight = (Math.random() * 2.5 + 0.5).toFixed(2);
    let currentTime = new Date().toLocaleTimeString().slice(0, 5);

    waveData.push(newWaveHeight);
    labels.push(currentTime);

    if (waveData.length > 10) {
        waveData.shift();
        labels.shift();
    }

    document.getElementById("wave-height").innerText = newWaveHeight;

    let statusText = document.getElementById("status");
    let siren = document.getElementById("siren");

    if (newWaveHeight >= 2.5) {
        statusText.innerText = "Status: Danger!";
        statusText.classList.remove("safe");
        statusText.classList.add("danger");
        siren.play();

        if (!dangerZone) {
            dangerZone = L.circle([7.185, 100.625], {
                color: "red",
                fillColor: "#f03",
                fillOpacity: 0.5,
                radius: 1000
            }).addTo(map);
        }

        showAlert(" High wave level detected! Please be cautious.");
        sendTelegramAlert(" Alert: High wave level detected!  Current height: " + newWaveHeight + " meters.");

        // แสดงเส้นทางอพยพ
        showEvacuationRoute();

    } else {
        statusText.innerText = "Status: Safe";
        statusText.classList.remove("danger");
        statusText.classList.add("safe");
        siren.pause();
        siren.currentTime = 0;

        if (dangerZone) {
            map.removeLayer(dangerZone);
            dangerZone = null;
        }
        // ลบเส้นทางอพยพ
        removeEvacuationRoute();
    }

    waveChart.update();

    // บันทึกค่าความสูงของคลื่น
    waveHistory.push({
        time: currentTime,
        height: newWaveHeight
    });

    // จำกัดจำนวนข้อมูลในประวัติ
    if (waveHistory.length > 20) {
        waveHistory.shift();
    }

    // คำนวณระยะเวลาปลอดภัย
    calculateTimeToImpact(newWaveHeight);

    // อัปเดตตารางสถิติ
    updateHistoryTable();
}

// ⏳ Update Wave Level Data Every 5 Seconds
setInterval(updateWaveData, 5000);

// Fetch Weather Data from OpenWeather API
async function fetchWeather() {
    const apiKey = "65add19fa98108edf6e185ee8b4cbdd9";
    const lat = 7.200;
    const lon = 100.600;
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=en&appid=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        document.getElementById("temp").innerText = data.main.temp.toFixed(1);
        document.getElementById("weather").innerText = data.weather[0].description;
        document.getElementById("wind-speed").innerText = (data.wind.speed * 3.6).toFixed(1);

        const directions = ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"];
        let windDirIndex = Math.round(data.wind.deg / 45) % 8;
        document.getElementById("wind-dir").innerText = directions[windDirIndex];

    } catch (error) {
        console.error("Error fetching weather data: ", error);
    }
}

// Call fetchWeather()
fetchWeather();

// Function to Show Alert
function showAlert(message) {
    alert(message);
}

// Update Landmark on the Map for Danger Zone and High Wave Alert
function updateLandmark() {
    let lat = 7.180;
    let lon = 100.620;

    // Draw circle to indicate the danger zone
    let dangerCircle = L.circle([lat, lon], {
        color: 'red',
        fillColor: '#f03',
        fillOpacity: 0.5,
        radius: 1000
    }).addTo(map);

    // Create a large marker
    let marker = L.marker([lat, lon], {
        icon: L.icon({
            iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Map_marker_icon.svg/120px-Map_marker_icon.svg.png',
            iconSize: [40, 40]
        })
    }).addTo(map);
}

// Evacuation Route Functions
let routingControl = null;

function showEvacuationRoute() {
    // กำหนดจุดหมายปลายทาง (Safe Zone)
    const safeZone = L.latLng(7.250, 100.650); // ตัวอย่างจุดหมายปลายทาง

    // สร้างเส้นทาง
    routingControl = L.Routing.control({
        waypoints: [
            L.latLng(7.185, 100.625), // จุดเริ่มต้น (ตำแหน่งปัจจุบัน)
            safeZone
        ],
        routeWhileDragging: true
    }).addTo(map);
}

function removeEvacuationRoute() {
    if (routingControl) {
        map.removeControl(routingControl);
        routingControl = null;
    }
}

// ฟังก์ชันคำนวณระยะเวลาปลอดภัย
function calculateTimeToImpact(waveHeight) {
    const speed = 10; // ความเร็วคลื่น (km/h)
    const distance = 5; // ระยะทางถึงพื้นที่เสี่ยง (km)
    if (waveHeight >= 2.5) {
        const time = (distance / speed) * 60; // แปลงเป็นนาที
        document.getElementById("impact-time").innerText = time.toFixed(0);
    } else {
        document.getElementById("impact-time").innerText = "Safe";
    }
}

// ฟังก์ชันอัปเดตตารางสถิติ
function updateHistoryTable() {
    const tableBody = document.querySelector("#history-table tbody");
    tableBody.innerHTML = ""; // ล้างข้อมูลเก่า

    waveHistory.forEach(entry => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${entry.time}</td>
            <td>${entry.height}</td>
        `;
        tableBody.appendChild(row);
    });
}

// อัปเดตแหล่งข้อมูล
function updateDataSource() {
    document.getElementById("wave-source").innerText = "API: Wave Monitoring System";
    document.getElementById("weather-source").innerText = "API: OpenWeatherMap";
}

// เรียกฟังก์ชันเมื่อโหลดหน้าเว็บ
updateDataSource();