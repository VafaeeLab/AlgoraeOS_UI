// ============================================================================
// DRUG SYNERGY STUDIO - Main Application Logic
// ============================================================================

// Global State Variables
let synergyDatabase = [];
let drugs = [];
let radarChart = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

// Load data when page loads
window.addEventListener('DOMContentLoaded', () => {
    loadDatabase();
});

// Load synergy database from localStorage
function loadDatabase() {
    const storedData = localStorage.getItem('synergyDatabase');
    
    if (storedData) {
        try {
            synergyDatabase = JSON.parse(storedData);
            console.log('✓ Database loaded:', synergyDatabase.length, 'entries');
            
            // Check if database has uncertainty data
            if (synergyDatabase.length > 0) {
                const hasUncertainties = synergyDatabase[0].bliss_uncertainty !== undefined;
                console.log('Database has uncertainties:', hasUncertainties);
            }
            
            // Extract unique values and populate dropdowns
            extractUniqueValues();
            populateDropdowns();
        } catch (error) {
            console.error('Error parsing database:', error);
            alert('Error loading database. Please contact the administrator.');
        }
    } else {
        console.warn('⚠ No database found in localStorage');
        alert('No database loaded. Please contact the administrator to upload the database via the admin panel.');
    }
}

// ============================================================================
// DATA EXTRACTION
// ============================================================================

// Extract unique drugs from drug_1 column only
function extractUniqueValues() {
    const drug1Set = new Set();
    
    synergyDatabase.forEach(entry => {
        if (entry.drug_1) {
            drug1Set.add(entry.drug_1);
        }
    });
    
    drugs = Array.from(drug1Set).sort();
    console.log('✓ Extracted', drugs.length, 'unique drugs');
}

// ============================================================================
// DROPDOWN MANAGEMENT (Cascading)
// ============================================================================

// Populate Drug 1 dropdown and set up event listeners
function populateDropdowns() {
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
    
    // Add event listeners for cascading dropdowns
    drug1Select.addEventListener('change', onDrug1Change);
    
    const drug2Select = document.getElementById('drug2');
    if (drug2Select) {
        drug2Select.addEventListener('change', onDrug2Change);
    }
    
    console.log('✓ Dropdowns initialized');
}

// Handle Drug 1 selection change
function onDrug1Change() {
    const drug1 = document.getElementById('drug1').value;
    const drug2Select = document.getElementById('drug2');
    const cellLineSelect = document.getElementById('cellLine');
    
    // Reset Drug 2 and Cell Line
    drug2Select.innerHTML = '<option value="">Select second drug...</option>';
    cellLineSelect.innerHTML = '<option value="">Select cell line...</option>';
    drug2Select.disabled = !drug1;
    cellLineSelect.disabled = true;
    
    // Hide results
    const resultsDiv = document.getElementById('results');
    if (resultsDiv) {
        resultsDiv.style.display = 'none';
    }
    
    if (!drug1) return;
    
    // Find all drug_2 values that pair with selected drug_1
    const drug2Set = new Set();
    synergyDatabase.forEach(entry => {
        if (entry.drug_1 === drug1) {
            drug2Set.add(entry.drug_2);
        }
    });
    
    // Populate Drug 2 dropdown
    const drug2Options = Array.from(drug2Set).sort();
    drug2Options.forEach(drug => {
        const option = document.createElement('option');
        option.value = drug;
        option.textContent = drug;
        drug2Select.appendChild(option);
    });
    
    console.log('✓ Drug 2 options updated:', drug2Options.length, 'available');
}

// Handle Drug 2 selection change
function onDrug2Change() {
    const drug1 = document.getElementById('drug1').value;
    const drug2 = document.getElementById('drug2').value;
    const cellLineSelect = document.getElementById('cellLine');
    
    // Reset Cell Line
    cellLineSelect.innerHTML = '<option value="">Select cell line...</option>';
    cellLineSelect.disabled = !drug2;
    
    // Hide results
    const resultsDiv = document.getElementById('results');
    if (resultsDiv) {
        resultsDiv.style.display = 'none';
    }
    
    if (!drug1 || !drug2) return;
    
    // Find all cell_line values for this drug combination
    const cellSet = new Set();
    synergyDatabase.forEach(entry => {
        if (entry.drug_1 === drug1 && entry.drug_2 === drug2) {
            cellSet.add(entry.cell_line);
        }
    });
    
    // Populate Cell Line dropdown
    const cellOptions = Array.from(cellSet).sort();
    cellOptions.forEach(cell => {
        const option = document.createElement('option');
        option.value = cell;
        option.textContent = cell;
        cellLineSelect.appendChild(option);
    });
    
    console.log('✓ Cell Line options updated:', cellOptions.length, 'available');
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
function predictSynergy() {
    console.log('Predict button clicked');
    
    const drug1 = document.getElementById('drug1').value;
    const drug2 = document.getElementById('drug2').value;
    const cellLine = document.getElementById('cellLine').value;
    
    console.log('Selected:', drug1, drug2, cellLine);
    
    // Validate inputs
    if (!drug1 || !drug2 || !cellLine) {
        alert('Please select all three fields (Drug 1, Drug 2, and Cell Line)');
        return;
    }
    
    // Search database
    const result = synergyDatabase.find(
        entry => entry.drug_1 === drug1 && 
                 entry.drug_2 === drug2 && 
                 entry.cell_line === cellLine
    );
    
    if (result) {
        console.log('✓ Result found:', result);
        displayResults(result);
    } else {
        console.error('✗ No result found for:', drug1, drug2, cellLine);
        alert('No data found for this combination.');
        const resultsDiv = document.getElementById('results');
        if (resultsDiv) {
            resultsDiv.style.display = 'none';
        }
    }
}

// Display results with uncertainties
function displayResults(result) {
    console.log('Displaying results:', result);
    
    try {
        // Display main values
        const blissValue = document.getElementById('bliss-value');
        const loeweValue = document.getElementById('loewe-value');
        const hsaValue = document.getElementById('hsa-value');
        const zipValue = document.getElementById('zip-value');
        
        if (!blissValue) {
            console.error('Result elements not found!');
            return;
        }
        
        blissValue.textContent = result.bliss.toFixed(3);
        loeweValue.textContent = result.loewe.toFixed(3);
        hsaValue.textContent = result.hsa.toFixed(3);
        zipValue.textContent = result.zip.toFixed(3);
        
        // Display uncertainties (handle missing data)
		// Display uncertainties (handle missing data and type conversion)
		const blissUncertainty = document.getElementById('bliss-uncertainty');
		const loeweUncertainty = document.getElementById('loewe-uncertainty');
		const hsaUncertainty = document.getElementById('hsa-uncertainty');
		const zipUncertainty = document.getElementById('zip-uncertainty');

		if (blissUncertainty) {
			// Helper function to safely format uncertainty
			const formatUncertainty = (value) => {
				if (value === undefined || value === null) return null;
				const num = parseFloat(value);
				return !isNaN(num) ? num.toFixed(3) : null;
			};
			
			const blissUnc = formatUncertainty(result.bliss_uncertainty);
			const loeweUnc = formatUncertainty(result.loewe_uncertainty);
			const hsaUnc = formatUncertainty(result.hsa_uncertainty);
			const zipUnc = formatUncertainty(result.zip_uncertainty);
			
			if (blissUnc !== null) {
				blissUncertainty.textContent = `±${blissUnc}`;
				loeweUncertainty.textContent = `±${loeweUnc}`;
				hsaUncertainty.textContent = `±${hsaUnc}`;
				zipUncertainty.textContent = `±${zipUnc}`;
			} else {
				// Hide uncertainty if not available
				blissUncertainty.textContent = '';
				loeweUncertainty.textContent = '';
				hsaUncertainty.textContent = '';
				zipUncertainty.textContent = '';
				console.warn('⚠ Uncertainty data not available in database');
			}
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
function processBatchQuery() {
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
                rowNum: index + 1,
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
    
    // Search database for each query
    const results = queries.map(query => {
        const found = synergyDatabase.find(
            entry => entry.drug_1 === query.drug_1 && 
                     entry.drug_2 === query.drug_2 && 
                     entry.cell_line === query.cell_line
        );
        
        if (found) {
            return {
                ...query,
                bliss: found.bliss,
                loewe: found.loewe,
                hsa: found.hsa,
                zip: found.zip,
                bliss_uncertainty: found.bliss_uncertainty || 0,
                loewe_uncertainty: found.loewe_uncertainty || 0,
                hsa_uncertainty: found.hsa_uncertainty || 0,
                zip_uncertainty: found.zip_uncertainty || 0,
                status: 'found'
            };
        } else {
            return {
                ...query,
                bliss: null,
                loewe: null,
                hsa: null,
                zip: null,
                bliss_uncertainty: null,
                loewe_uncertainty: null,
                hsa_uncertainty: null,
                zip_uncertainty: null,
                status: 'not_found'
            };
        }
    });
    
    const foundCount = results.filter(r => r.status === 'found').length;
    console.log(`✓ Found ${foundCount}/${queries.length} results`);
    
    displayBatchResults(results);
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
    
    // Show results section
    const resultsDiv = document.getElementById('batch-results');
    resultsDiv.style.display = 'block';
    
    // Scroll to results
    setTimeout(() => {
        resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
    
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

// ============================================================================
// END
// ============================================================================

console.log('✓ Drug Synergy Studio loaded');