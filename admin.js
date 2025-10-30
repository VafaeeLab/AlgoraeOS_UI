function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        loadCSVData(content);
    };
    reader.readAsText(file);
}

function loadFromText() {
    const content = document.getElementById('csv-text').value;
    if (!content.trim()) {
        alert('Please paste CSV content first');
        return;
    }
    loadCSVData(content);
}

function loadCSVData(csvContent) {
    // Simple CSV parser
    const lines = csvContent.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    // Validate headers
    const requiredHeaders = ['drug_1', 'drug_2', 'cell_line', 'bliss', 'loewe', 'hsa', 'zip', 
                             'bliss_uncertainty', 'loewe_uncertainty', 'hsa_uncertainty', 'zip_uncertainty'];
    const hasAllHeaders = requiredHeaders.every(h => headers.includes(h));
    
    if (!hasAllHeaders) {
        showStatus('error', 'Invalid CSV format. Required columns: drug_1, drug_2, cell_line, bliss, loewe, hsa, zip, bliss_uncertainty, loewe_uncertainty, hsa_uncertainty, zip_uncertainty');
        return;
    }
    
    // Parse data
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const values = lines[i].split(',').map(v => v.trim());
        const entry = {};
        
        headers.forEach((header, index) => {
            if (['bliss', 'loewe', 'hsa', 'zip', 'bliss_uncertainty', 'loewe_uncertainty', 'hsa_uncertainty', 'zip_uncertainty'].includes(header)) {
                entry[header] = parseFloat(values[index]);
            } else {
                entry[header] = values[index];
            }
        });
        
        // Validate entry
        if (entry.drug_1 && entry.drug_2 && entry.cell_line &&
            !isNaN(entry.bliss) && !isNaN(entry.loewe) && 
            !isNaN(entry.hsa) && !isNaN(entry.zip) &&
            !isNaN(entry.bliss_uncertainty) && !isNaN(entry.loewe_uncertainty) && 
            !isNaN(entry.hsa_uncertainty) && !isNaN(entry.zip_uncertainty)) {
            data.push(entry);
        }
    }
    
    if (data.length === 0) {
        showStatus('error', 'No valid data found. Please check CSV format.');
        return;
    }
    
    // Save to localStorage
    localStorage.setItem('synergyDatabase', JSON.stringify(data));
    
    // Show success
    showStatus('success', `Successfully loaded ${data.length} entries into the database`);
    
    // Show preview
    showPreview(data);
}

function showStatus(type, message) {
    const statusDiv = document.getElementById('upload-status');
    statusDiv.className = `upload-status ${type}`;
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
}

function showPreview(data) {
    // Calculate stats
    const uniqueDrugs = new Set();
    const uniqueCells = new Set();
    
    data.forEach(row => {
        uniqueDrugs.add(row.drug_1);
        uniqueDrugs.add(row.drug_2);
        uniqueCells.add(row.cell_line);
    });
    
    document.getElementById('total-rows').textContent = data.length;
    document.getElementById('unique-drugs').textContent = uniqueDrugs.size;
    document.getElementById('unique-cells').textContent = uniqueCells.size;
    
    // Show preview table (first 10 rows)
    const tbody = document.querySelector('#preview-table tbody');
    tbody.innerHTML = '';
    
    data.slice(0, 10).forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.drug_1}</td>
            <td>${row.drug_2}</td>
            <td>${row.cell_line}</td>
            <td><span title="±${row.bliss_uncertainty.toFixed(3)}">${row.bliss.toFixed(3)}</span></td>
            <td><span title="±${row.loewe_uncertainty.toFixed(3)}">${row.loewe.toFixed(3)}</span></td>
            <td><span title="±${row.hsa_uncertainty.toFixed(3)}">${row.hsa.toFixed(3)}</span></td>
            <td><span title="±${row.zip_uncertainty.toFixed(3)}">${row.zip.toFixed(3)}</span></td>
        `;
        tbody.appendChild(tr);
    });
    
    document.getElementById('data-preview').style.display = 'block';
}