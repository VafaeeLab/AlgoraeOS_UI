// ============================================================================
// ALGORAEOS - AI-Powered Drug Combination Analysis (API Version)
// ============================================================================

// Configuration
const API_BASE_URL = 'http://localhost:5000/api';

// Global State Variables
let drugs = [];
let radarChart = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

// Load data when page loads
window.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

// Initialize application
async function initializeApp() {
    console.log('🚀 Initializing AlgoraeOS...');
    
    // Check API health
    const isHealthy = await checkAPIHealth();
    
    if (!isHealthy) {
        showError('Unable to connect to database server. Please ensure the server is running.');
        return;
    }
    
    // Load drugs for Drug 1 dropdown
    await loadDrugs();
    
    // Set up event listeners
    setupEventListeners();
    
    console.log('✓ AlgoraeOS initialized successfully');
}

// Check if API is accessible
async function checkAPIHealth() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        const data = await response.json();
        console.log('✓ API Health:', data);
        return data.status === 'healthy';
    } catch (error) {
        console.error('✗ API Health Check Failed:', error);
        return false;
    }
}

// Load all drugs from API
async function loadDrugs() {
    try {
        const response = await fetch(`${API_BASE_URL}/drugs/all`);
        drugs = await response.json();
        console.log('✓ Loaded', drugs.length, 'drugs');
        populateDrug1Dropdown();
    } catch (error) {
        console.error('Error loading drugs:', error);
        showError('Failed to load drugs from database');
    }
}

// ============================================================================
// DROPDOWN MANAGEMENT (Cascading with API)
// ============================================================================

// Populate Drug 1 dropdown
function populateDrug1Dropdown() {
    const drug1Select = document.getElementById('drug1');
    
    if (!drug1Select) {
        console.error('Drug 1 select element not found!');
        return;
    }
    
    // Clear and populate Drug 1
    drug1Select.innerHTML = '<option value="">Select first drug...</option>';
    
    drugs.forEach(drug => {
        const option = document.createElement('option');
        option.value = drug;
        option.textContent = drug;
        drug1Select.appendChild(option);
    });
    
    console.log('✓ Drug 1 dropdown populated');
}

// Set up event listeners
function setupEventListeners() {
    const drug1Select = document.getElementById('drug1');
    const drug2Select = document.getElementById('drug2');
    
    if (drug1Select) {
        drug1Select.addEventListener('change', onDrug1Change);
    }
    
    if (drug2Select) {
        drug2Select.addEventListener('change', onDrug2Change);
    }
}

// Handle Drug 1 selection change
async function onDrug1Change() {
    const drug1 = document.getElementById('drug1').value;
    const drug2Select = document.getElementById('drug2');
    const cellLineSelect = document.getElementById('cellLine');
    
    // Reset Drug 2 and Cell Line
    drug2Select.innerHTML = '<option value="">Select second drug...</option>';
    cellLineSelect.innerHTML = '<option value="">Select cell line...</option>';
    drug2Select.disabled = !drug1;
    cellLineSelect.disabled = true;
    
    // Hide results
    hideResults();
    
    if (!drug1) return;
    
    // Show loading state
    drug2Select.innerHTML = '<option value="">Loading...</option>';
    
    try {
        // Fetch drug partners from API
        const response = await fetch(`${API_BASE_URL}/drugs/partners?drug1=${encodeURIComponent(drug1)}`);
        const partners = await response.json();
        
        // Populate Drug 2 dropdown
        drug2Select.innerHTML = '<option value="">Select second drug...</option>';
        partners.forEach(drug => {
            const option = document.createElement('option');
            option.value = drug;
            option.textContent = drug;
            drug2Select.appendChild(option);
        });
        
        console.log('✓ Drug 2 options updated:', partners.length, 'available');
    } catch (error) {
        console.error('Error loading drug partners:', error);
        drug2Select.innerHTML = '<option value="">Error loading options</option>';
    }
}

// Handle Drug 2 selection change
async function onDrug2Change() {
    const drug1 = document.getElementById('drug1').value;
    const drug2 = document.getElementById('drug2').value;
    const cellLineSelect = document.getElementById('cellLine');
    
    // Reset Cell Line
    cellLineSelect.innerHTML = '<option value="">Select cell line...</option>';
    cellLineSelect.disabled = !drug2;
    
    // Hide results
    hideResults();
    
    if (!drug1 || !drug2) return;
    
    // Show loading state
    cellLineSelect.innerHTML = '<option value="">Loading...</option>';
    
    try {
        // Fetch cell lines from API
        const response = await fetch(
            `${API_BASE_URL}/celllines?drug1=${encodeURIComponent(drug1)}&drug2=${encodeURIComponent(drug2)}`
        );
        const celllines = await response.json();
        
        // Populate Cell Line dropdown
        cellLineSelect.innerHTML = '<option value="">Select cell line...</option>';
        celllines.forEach(cell => {
            const option = document.createElement('option');
            option.value = cell;
            option.textContent = cell;
            cellLineSelect.appendChild(option);
        });
        
        console.log('✓ Cell Line options updated:', celllines.length, 'available');
    } catch (error) {
        console.error('Error loading cell lines:', error);
        cellLineSelect.innerHTML = '<option value="">Error loading options</option>';
    }
}

// ============================================================================
// MODE SWITCHING
// ============================================================================

// Switch between Single Query and Batch Mode
function switchMode(mode) {
    const singleMode = document.getElementById('single-mode');
    const batchMode = document.getElementById('batch-mode');
    const buttons = document.querySelectorAll('.mode-btn');
    
    buttons.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    if (mode === 'single') {
        singleMode.style.display = 'block';
        batchMode.style.display = 'none';
    } else {
        singleMode.style.display = 'none';
        batchMode.style.display = 'block';
    }
}

// ============================================================================
// SINGLE QUERY MODE
// ============================================================================

// Predict synergy for single query
async function predictSynergy() {
    console.log('🔍 Predict button clicked');
    
    const drug1 = document.getElementById('drug1').value;
    const drug2 = document.getElementById('drug2').value;
    const cellLine = document.getElementById('cellLine').value;
    
    console.log('Selected:', drug1, drug2, cellLine);
    
    // Validate inputs
    if (!drug1 || !drug2 || !cellLine) {
        alert('Please select all three fields (Drug 1, Drug 2, and Cell Line)');
        return;
    }
    
    // Show loading state
    const resultsDiv = document.getElementById('results');
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = '<div style="text-align: center; padding: 2rem;"><p>Loading...</p></div>';
    
    try {
        // Query API
        const response = await fetch(
            `${API_BASE_URL}/synergy?drug1=${encodeURIComponent(drug1)}&drug2=${encodeURIComponent(drug2)}&cellline=${encodeURIComponent(cellLine)}`
        );
        
        if (!response.ok) {
            throw new Error('Combination not found');
        }
        
        const result = await response.json();
        console.log('✓ Result found:', result);
        
        // Restore results HTML structure
        resultsDiv.innerHTML = getResultsHTML();
        
        // Display results
        displayResults(result);
    } catch (error) {
        console.log('✗ Error:', error);
        resultsDiv.style.display = 'none';
        alert(`No data found for the combination:\n${drug1} + ${drug2} in ${cellLine}\n\nTry a different combination or contact the administrator to add this data.`);
    }
}

// Get results HTML structure
function getResultsHTML() {
    return `
        <div class="results-header">
            <h4>Synergy Scores</h4>
        </div>
        <div class="results-grid">
            <div class="metrics-panel">
                <div class="metric-card metric-bliss">
                    <div class="metric-header">
                        <span class="metric-name">Bliss</span>
                        <div class="metric-value-group">
                            <span class="metric-value" id="bliss-value">-</span>
                            <span class="metric-uncertainty" id="bliss-uncertainty"></span>
                        </div>
                    </div>
                    <p class="metric-desc">Independence model</p>
                </div>
                <div class="metric-card metric-loewe">
                    <div class="metric-header">
                        <span class="metric-name">Loewe</span>
                        <div class="metric-value-group">
                            <span class="metric-value" id="loewe-value">-</span>
                            <span class="metric-uncertainty" id="loewe-uncertainty"></span>
                        </div>
                    </div>
                    <p class="metric-desc">Additivity reference</p>
                </div>
                <div class="metric-card metric-hsa">
                    <div class="metric-header">
                        <span class="metric-name">HSA</span>
                        <div class="metric-value-group">
                            <span class="metric-value" id="hsa-value">-</span>
                            <span class="metric-uncertainty" id="hsa-uncertainty"></span>
                        </div>
                    </div>
                    <p class="metric-desc">Highest single agent</p>
                </div>
                <div class="metric-card metric-zip">
                    <div class="metric-header">
                        <span class="metric-name">ZIP</span>
                        <div class="metric-value-group">
                            <span class="metric-value" id="zip-value">-</span>
                            <span class="metric-uncertainty" id="zip-uncertainty"></span>
                        </div>
                    </div>
                    <p class="metric-desc">Zero interaction potency</p>
                </div>
            </div>
            <div class="chart-panel">
                <canvas id="radarChart"></canvas>
            </div>
        </div>
        <div class="info-banner">
            <strong>Note:</strong> Scores depend on assay normalization; interpret within context.
        </div>
    `;
}

// Display results with uncertainties
function displayResults(result) {
    console.log('Displaying results:', result);
    
    try {
        // Display main values
        document.getElementById('bliss-value').textContent = result.bliss.toFixed(3);
        document.getElementById('loewe-value').textContent = result.loewe.toFixed(3);
        document.getElementById('hsa-value').textContent = result.hsa.toFixed(3);
        document.getElementById('zip-value').textContent = result.zip.toFixed(3);
        
        // Display uncertainties
        const blissUncertainty = document.getElementById('bliss-uncertainty');
        const loeweUncertainty = document.getElementById('loewe-uncertainty');
        const hsaUncertainty = document.getElementById('hsa-uncertainty');
        const zipUncertainty = document.getElementById('zip-uncertainty');
        
        if (result.bliss_uncertainty !== null && result.bliss_uncertainty !== undefined) {
            blissUncertainty.textContent = `±${result.bliss_uncertainty.toFixed(3)}`;
            loeweUncertainty.textContent = `±${result.loewe_uncertainty.toFixed(3)}`;
            hsaUncertainty.textContent = `±${result.hsa_uncertainty.toFixed(3)}`;
            zipUncertainty.textContent = `±${result.zip_uncertainty.toFixed(3)}`;
        }
        
        // Show results section
        const resultsDiv = document.getElementById('results');
        resultsDiv.style.display = 'block';
        
        // Scroll to results smoothly
        setTimeout(() => {
            resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
        
        // Update radar chart
        updateRadarChart(result);
        
        console.log('✓ Results displayed successfully');
    } catch (error) {
        console.error('Error displaying results:', error);
        alert('Error displaying results. Check console for details.');
    }
}

// Hide results section
function hideResults() {
    const resultsDiv = document.getElementById('results');
    if (resultsDiv) {
        resultsDiv.style.display = 'none';
    }
}

// ============================================================================
// RADAR CHART
// ============================================================================

// Update radar chart with new data
function updateRadarChart(result) {
    const canvas = document.getElementById('radarChart');
    if (!canvas) {
        console.error('Radar chart canvas not found!');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart if it exists
    if (radarChart) {
        radarChart.destroy();
    }
    
    try {
        // Create new chart
        radarChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Bliss', 'Loewe', 'HSA', 'ZIP'],
                datasets: [{
                    label: 'Synergy Scores',
                    data: [result.bliss, result.loewe, result.hsa, result.zip],
                    backgroundColor: 'rgba(79, 123, 247, 0.2)',
                    borderColor: '#4F7BF7',
                    borderWidth: 3,
                    pointBackgroundColor: '#4F7BF7',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: '#4F7BF7',
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 1,
                        min: 0,
                        ticks: {
                            stepSize: 0.2,
                            font: {
                                size: 11
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        angleLines: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        pointLabels: {
                            font: {
                                size: 13,
                                weight: 'bold'
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed.r.toFixed(3);
                                
                                // Add uncertainty if available
                                if (result.bliss_uncertainty !== undefined) {
                                    let uncertainty = '';
                                    if (label === 'Bliss') uncertainty = result.bliss_uncertainty.toFixed(3);
                                    else if (label === 'Loewe') uncertainty = result.loewe_uncertainty.toFixed(3);
                                    else if (label === 'HSA') uncertainty = result.hsa_uncertainty.toFixed(3);
                                    else if (label === 'ZIP') uncertainty = result.zip_uncertainty.toFixed(3);
                                    return `${label}: ${value} ±${uncertainty}`;
                                } else {
                                    return `${label}: ${value}`;
                                }
                            }
                        }
                    }
                }
            }
        });
        
        console.log('✓ Radar chart updated');
    } catch (error) {
        console.error('Error creating chart:', error);
    }
}

// ============================================================================
// BATCH QUERY MODE
// ============================================================================

// Process batch query from textarea
async function processBatchQuery() {
    const input = document.getElementById('batch-input').value.trim();
    
    if (!input) {
        alert('Please enter queries in the text area');
        return;
    }
    
    const lines = input.split('\n').filter(line => line.trim());
    const queries = [];
    
    // Parse each line
    lines.forEach((line, index) => {
        const parts = line.split(',').map(p => p.trim());
        
        if (parts.length === 3) {
            queries.push({
                drug_1: parts[0],
                drug_2: parts[1],
                cell_line: parts[2]
            });
        }
    });
    
    if (queries.length === 0) {
        alert('No valid queries found. Please use format:\ndrug_1, drug_2, cell_line');
        return;
    }
    
    console.log('✓ Processing', queries.length, 'batch queries');
    
    // Show loading state
    const resultsDiv = document.getElementById('batch-results');
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = '<div style="text-align: center; padding: 2rem;"><p>Processing batch query...</p></div>';
    
    try {
        // Send batch request to API
        const response = await fetch(`${API_BASE_URL}/synergy/batch`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ queries })
        });
        
        const data = await response.json();
        const results = data.results;
        
        const foundCount = results.filter(r => r.status === 'found').length;
        console.log(`✓ Found ${foundCount}/${queries.length} results`);
        
        // Restore results HTML structure
        resultsDiv.innerHTML = getBatchResultsHTML();
        
        // Display results
        displayBatchResults(results);
    } catch (error) {
        console.error('Error processing batch query:', error);
        resultsDiv.innerHTML = '<div style="text-align: center; padding: 2rem;"><p class="error">Error processing batch query</p></div>';
    }
}

// Get batch results HTML structure
function getBatchResultsHTML() {
    return `
        <div class="results-header">
            <h4>Results</h4>
            <button class="btn-secondary" onclick="exportBatchResults()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export CSV
            </button>
        </div>
        <div class="table-container">
            <table id="results-table">
                <thead>
                    <tr>
                        <th>Drug 1</th>
                        <th>Drug 2</th>
                        <th>Cell Line</th>
                        <th>Bliss</th>
                        <th>Loewe</th>
                        <th>HSA</th>
                        <th>ZIP</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>
    `;
}

// Display batch results in table
function displayBatchResults(results) {
    const tbody = document.querySelector('#results-table tbody');
    tbody.innerHTML = '';
    
    results.forEach(row => {
        const tr = document.createElement('tr');
        
        // Check if uncertainties are available
        const hasUncertainty = row.bliss_uncertainty !== null && row.bliss_uncertainty !== undefined;
        
        tr.innerHTML = `
            <td>${row.drug_1}</td>
            <td>${row.drug_2}</td>
            <td>${row.cell_line}</td>
            <td>${row.bliss !== null ? (hasUncertainty ? `<span class="metric-with-uncertainty" title="Uncertainty: ±${row.bliss_uncertainty.toFixed(3)}">${row.bliss.toFixed(3)}</span>` : row.bliss.toFixed(3)) : '-'}</td>
            <td>${row.loewe !== null ? (hasUncertainty ? `<span class="metric-with-uncertainty" title="Uncertainty: ±${row.loewe_uncertainty.toFixed(3)}">${row.loewe.toFixed(3)}</span>` : row.loewe.toFixed(3)) : '-'}</td>
            <td>${row.hsa !== null ? (hasUncertainty ? `<span class="metric-with-uncertainty" title="Uncertainty: ±${row.hsa_uncertainty.toFixed(3)}">${row.hsa.toFixed(3)}</span>` : row.hsa.toFixed(3)) : '-'}</td>
            <td>${row.zip !== null ? (hasUncertainty ? `<span class="metric-with-uncertainty" title="Uncertainty: ±${row.zip_uncertainty.toFixed(3)}">${row.zip.toFixed(3)}</span>` : row.zip.toFixed(3)) : '-'}</td>
            <td>
                <span class="status-badge ${row.status === 'found' ? 'status-found' : 'status-not-found'}">
                    ${row.status === 'found' ? '✓ Found' : '✗ Not found'}
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Store results for export
    window.batchResults = results;
    
    console.log('✓ Batch results displayed');
}

// ============================================================================
// EXPORT FUNCTIONALITY
// ============================================================================

// Export batch results to CSV
function exportBatchResults() {
    if (!window.batchResults || window.batchResults.length === 0) {
        alert('No results to export');
        return;
    }
    
    // Create CSV content
    const headers = [
        'drug_1', 'drug_2', 'cell_line', 
        'bliss', 'loewe', 'hsa', 'zip', 'status'
    ];
    
    const rows = window.batchResults.map(r => [
        r.drug_1,
        r.drug_2,
        r.cell_line,
        r.bliss !== null ? r.bliss.toFixed(3) : '',
        r.loewe !== null ? r.loewe.toFixed(3) : '',
        r.hsa !== null ? r.hsa.toFixed(3) : '',
        r.zip !== null ? r.zip.toFixed(3) : '',
        r.status
    ]);
    
    const csvContent = [
        headers.join(','),
        ...rows.map(r => r.join(','))
    ].join('\n');
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 10);
    
    link.href = url;
    link.download = `synergy_results_${timestamp}.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    
    console.log('✓ Results exported to CSV');
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Show error message
function showError(message) {
    alert(`Error: ${message}`);
    console.error(message);
}

// ============================================================================
// MODAL FUNCTIONS
// ============================================================================

// Show About modal
function showAbout() {
    const modal = document.getElementById('about-modal');
    modal.classList.add('active');
}

// Hide About modal
function hideAbout() {
    const modal = document.getElementById('about-modal');
    modal.classList.remove('active');
}

// Close modal when clicking outside
window.addEventListener('click', function(event) {
    const modal = document.getElementById('about-modal');
    if (event.target === modal) {
        hideAbout();
    }
});

// ============================================================================
// END
// ============================================================================

console.log('🚀 AlgoraeOS (API Version) loaded successfully!');