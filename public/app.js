// State
let currentTab = 'journal';

// Init
document.addEventListener('DOMContentLoaded', () => {
  loadUser();
  loadJournalEntries();
  loadDocuments();
  setupTabs();
});

// User
async function loadUser() {
  try {
    const res = await fetch('/auth/user');
    const user = await res.json();
    document.getElementById('userName').textContent = user.name;
  } catch (err) {
    console.error('Failed to load user:', err);
  }
}

// Tabs
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
      currentTab = tab.dataset.tab;
    });
  });
}

// Journal
async function loadJournalEntries() {
  try {
    const res = await fetch('/api/journal');
    const entries = await res.json();
    renderJournalList(entries);
  } catch (err) {
    console.error('Failed to load journal entries:', err);
  }
}

function renderJournalList(entries) {
  const list = document.getElementById('journalList');
  if (entries.length === 0) {
    list.innerHTML = '<p>No journal entries yet.</p>';
    return;
  }
  list.innerHTML = entries.map(e => `
    <div class="list-item">
      <h3>${e.title || 'Untitled'}</h3>
      <p>${truncate(e.content, 200)}</p>
      <small>${formatDate(e.created_at)}</small>
      <div class="list-item-actions">
        <button onclick="deleteEntry(${e.id})" class="btn btn-sm btn-danger">Delete</button>
      </div>
    </div>
  `).join('');
}

async function saveEntry() {
  const title = document.getElementById('entryTitle').value.trim();
  const content = document.getElementById('entryContent').value.trim();

  if (!content) {
    alert('Please enter some content');
    return;
  }

  try {
    document.body.classList.add('loading');
    const res = await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content }),
    });

    if (!res.ok) throw new Error('Failed to save');

    document.getElementById('entryTitle').value = '';
    document.getElementById('entryContent').value = '';
    loadJournalEntries();
  } catch (err) {
    alert('Failed to save entry');
    console.error(err);
  } finally {
    document.body.classList.remove('loading');
  }
}

async function deleteEntry(id) {
  if (!confirm('Delete this entry?')) return;

  try {
    await fetch(`/api/journal/${id}`, { method: 'DELETE' });
    loadJournalEntries();
  } catch (err) {
    alert('Failed to delete entry');
    console.error(err);
  }
}

// Documents
async function loadDocuments() {
  try {
    const res = await fetch('/api/documents');
    const docs = await res.json();
    renderDocumentList(docs);
  } catch (err) {
    console.error('Failed to load documents:', err);
  }
}

function renderDocumentList(docs) {
  const list = document.getElementById('documentList');
  if (docs.length === 0) {
    list.innerHTML = '<p>No documents uploaded yet.</p>';
    return;
  }
  list.innerHTML = docs.map(d => `
    <div class="list-item">
      <h3>${d.original_name}</h3>
      <small>${formatBytes(d.size_bytes)} - ${formatDate(d.created_at)}</small>
      <div class="list-item-actions">
        <button onclick="deleteDocument(${d.id})" class="btn btn-sm btn-danger">Delete</button>
      </div>
    </div>
  `).join('');
}

async function uploadFile() {
  const input = document.getElementById('fileInput');
  const file = input.files[0];

  if (!file) {
    alert('Please select a file');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    document.body.classList.add('loading');
    const res = await fetch('/api/documents', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) throw new Error('Failed to upload');

    input.value = '';
    loadDocuments();
  } catch (err) {
    alert('Failed to upload file');
    console.error(err);
  } finally {
    document.body.classList.remove('loading');
  }
}

async function deleteDocument(id) {
  if (!confirm('Delete this document?')) return;

  try {
    await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    loadDocuments();
  } catch (err) {
    alert('Failed to delete document');
    console.error(err);
  }
}

// Search
async function search() {
  const query = document.getElementById('searchInput').value.trim();
  if (!query) return;

  const resultsDiv = document.getElementById('searchResults');

  try {
    document.body.classList.add('loading');
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const results = await res.json();

    if (results.length === 0) {
      resultsDiv.innerHTML = '<p>No results found.</p>';
    } else {
      resultsDiv.innerHTML = `
        <h4>Search Results</h4>
        ${results.map(r => `
          <div class="result-item">
            <span class="type">${r.type}</span>
            <strong>${r.title || 'Untitled'}</strong>
            <span class="similarity">${(r.similarity * 100).toFixed(1)}% match</span>
            <p>${truncate(r.content, 150)}</p>
          </div>
        `).join('')}
      `;
    }

    resultsDiv.classList.remove('hidden');
  } catch (err) {
    alert('Search failed');
    console.error(err);
  } finally {
    document.body.classList.remove('loading');
  }
}

// Handle Enter key in search
document.getElementById('searchInput')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') search();
});

// Utilities
function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '...' : str;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
