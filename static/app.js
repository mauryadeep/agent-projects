/**
 * Ambient Expense-Approval Agent (ADK 2.0) - Robust Dynamic Frontend Controller
 */

(function () {
  'use strict';

  function initApp() {
    // -------------------------------------------------------------
    // DOM Element References (with defensive null checks)
    // -------------------------------------------------------------
    const form = document.getElementById('expense-form');
    const amountInput = document.getElementById('amount-input');
    const dateInput = document.getElementById('date-input');
    const submitterInput = document.getElementById('submitter-input');
    const categoryInput = document.getElementById('category-input');
    const descriptionInput = document.getElementById('description-input');
    const submitBtn = document.getElementById('submit-expense-btn');

    // Dynamic Presets Elements
    const presetsContainer = document.getElementById('presets-container');
    const presetsCountBadge = document.getElementById('presets-count-badge');
    const openCreatePresetBtn = document.getElementById('open-create-preset-btn');
    const resetPresetsBtn = document.getElementById('reset-presets-btn');
    const createPresetPanel = document.getElementById('create-preset-panel');
    const closePresetPanelBtn = document.getElementById('close-preset-panel-btn');
    const cancelNewPresetBtn = document.getElementById('cancel-new-preset-btn');
    const saveNewPresetBtn = document.getElementById('save-new-preset-btn');

    // Form New Preset Inputs
    const newPresetTitle = document.getElementById('new-preset-title');
    const newPresetAmount = document.getElementById('new-preset-amount');
    const newPresetCategory = document.getElementById('new-preset-category');
    const newPresetSubmitter = document.getElementById('new-preset-submitter');
    const newPresetDesc = document.getElementById('new-preset-desc');

    // Action Bar Buttons
    const saveCurrentFormPresetBtn = document.getElementById('save-current-form-preset-btn');
    const addToQueueBtn = document.getElementById('add-to-queue-btn');

    // Batch Queue Elements
    const batchQueueCard = document.getElementById('batch-queue-card');
    const queueCountBadge = document.getElementById('queue-count-badge');
    const queueList = document.getElementById('queue-list');
    const clearQueueBtn = document.getElementById('clear-queue-btn');
    const ingestQueueBtn = document.getElementById('ingest-queue-btn');

    // Stats Elements
    const statTotal = document.getElementById('stat-total');
    const statAuto = document.getElementById('stat-auto');
    const statHuman = document.getElementById('stat-human');
    const statVolume = document.getElementById('stat-volume');

    // Graph Nodes
    const nodeStart = document.getElementById('node-start');
    const nodeThreshold = document.getElementById('node-threshold');
    const nodeAuto = document.getElementById('node-auto');
    const nodeLlm = document.getElementById('node-llm');
    const nodeHitl = document.getElementById('node-hitl');
    const nodeFinalize = document.getElementById('node-finalize');
    const graphStateLabel = document.getElementById('graph-state-label');

    // HITL Card Elements
    const hitlCard = document.getElementById('hitl-card');
    const hitlRiskScore = document.getElementById('hitl-risk-score');
    const hitlRiskBadge = document.getElementById('hitl-risk-badge');
    const hitlExpenseInfo = document.getElementById('hitl-expense-info');
    const hitlRecommendation = document.getElementById('hitl-recommendation');
    const hitlRationale = document.getElementById('hitl-rationale');
    const hitlFlagsList = document.getElementById('hitl-flags-list');
    const hitlNotesInput = document.getElementById('hitl-notes-input');
    const hitlSessionBadge = document.getElementById('hitl-session-badge');
    const approveBtn = document.getElementById('approve-btn');
    const rejectBtn = document.getElementById('reject-btn');

    // History Table Elements
    const auditTbody = document.getElementById('audit-tbody');
    const refreshHistoryBtn = document.getElementById('refresh-history-btn');
    const toastContainer = document.getElementById('toast-container');

    // -------------------------------------------------------------
    // State
    // -------------------------------------------------------------
    let activePausedSession = null;
    let batchQueue = [];

    // Default Standard Presets
    const DEFAULT_PRESETS = [
      {
        id: 'p_default_1',
        title: 'Team Lunch',
        icon: '☕',
        amount: 420.0,
        submitter: 'amit.patel@acme.corp',
        category: 'Meals & Entertainment',
        description: 'Afternoon tea and snacks for client technical workshop',
        isDefault: true,
      },
      {
        id: 'p_default_2',
        title: 'Cloud Infrastructure',
        icon: '💻',
        amount: 5400.0,
        submitter: 'sneha.kulkarni@acme.corp',
        category: 'Cloud Infrastructure',
        description: 'Monthly reserved cloud compute cluster for AI evaluation benchmark',
        isDefault: true,
      },
      {
        id: 'p_default_3',
        title: 'Luxury Festival Hamper',
        icon: '🎁',
        amount: 14500.0,
        submitter: 'dev.kapoor@acme.corp',
        category: 'Gifts & Miscellaneous',
        description: 'Personal luxury festival gift hamper for client executives',
        isDefault: true,
      },
    ];

    // Initialize Default Date
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }

    // -------------------------------------------------------------
    // URL Parameter Recovery (in case previous form submit reloaded page)
    // -------------------------------------------------------------
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('amount')) {
        const amt = urlParams.get('amount');
        if (amountInput) amountInput.value = amt;
        if (urlParams.get('date') && dateInput) dateInput.value = urlParams.get('date');
        if (urlParams.get('submitter') && submitterInput) submitterInput.value = urlParams.get('submitter');
        if (urlParams.get('category') && categoryInput) categoryInput.value = urlParams.get('category');
        if (urlParams.get('description') && descriptionInput) descriptionInput.value = urlParams.get('description');

        // Clean the query string without reloading page
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (e) {
      console.warn('URL param parse error:', e);
    }

    // -------------------------------------------------------------
    // Toast Notification System
    // -------------------------------------------------------------
    function showToast(message, type = 'info') {
      if (!toastContainer) {
        console.log(`[Toast ${type}]: ${message}`);
        return;
      }
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ️';
      toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
      toastContainer.appendChild(toast);

      setTimeout(() => {
        toast.style.transition = 'all 0.3s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }

    // -------------------------------------------------------------
    // Dynamic Presets Storage & Rendering
    // -------------------------------------------------------------
    function loadPresets() {
      try {
        const stored = localStorage.getItem('adk_expense_presets');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn('Could not read presets from localStorage:', e);
      }
      return [...DEFAULT_PRESETS];
    }

    function savePresets(list) {
      try {
        localStorage.setItem('adk_expense_presets', JSON.stringify(list));
      } catch (e) {
        console.warn('Could not save presets to localStorage:', e);
      }
    }

    let presets = loadPresets();

    function getCategoryIcon(cat) {
      const map = {
        'Meals & Entertainment': '☕',
        'Cloud Infrastructure': '💻',
        'Software Subscriptions': '🔑',
        'Office Supplies': '📎',
        'Travel & Lodging': '✈️',
        'Gifts & Miscellaneous': '🎁',
      };
      return map[cat] || '📄';
    }

    function renderPresets() {
      if (!presetsContainer) return;
      presetsContainer.innerHTML = '';

      if (presetsCountBadge) {
        presetsCountBadge.textContent = `${presets.length} presets`;
      }

      presets.forEach((p) => {
        const card = document.createElement('div');
        card.className = 'preset-card-dynamic';

        const isAuto = Number(p.amount) < 1000.0;
        const badgeClass = isAuto ? 'preset-badge-auto' : 'preset-badge-review';
        const badgeText = isAuto ? 'Under ₹1K • Auto' : '≥ ₹1K • LLM Review';
        const icon = p.icon || getCategoryIcon(p.category);
        const formattedAmount = `₹${Number(p.amount).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;

        card.innerHTML = `
          <div class="preset-header">
            <div class="preset-title-wrap">
              <span>${icon}</span>
              <span>${escapeHtml(p.title || 'Untitled')}</span>
            </div>
            <span class="preset-badge ${badgeClass}">${badgeText}</span>
          </div>
          <div class="preset-details">
            <span class="preset-amount-tag">${formattedAmount}</span>
            <span style="font-size: 11px;">${escapeHtml(p.category || 'General')}</span>
          </div>
          <div style="font-size: 11px; color: var(--text-subtle); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(p.description || '')}
          </div>
          <div class="preset-actions">
            <button type="button" class="btn-preset-load" data-id="${p.id}" title="Populate form with this expense">
              📝 Load Form
            </button>
            <button type="button" class="btn-preset-ingest" data-id="${p.id}" title="Instantly ingest this expense into workflow">
              ⚡ Ingest Now
            </button>
            ${!p.isDefault ? `<button type="button" class="btn-preset-del" data-id="${p.id}" title="Delete preset">🗑️</button>` : ''}
          </div>
        `;

        // Card button events
        const loadBtn = card.querySelector('.btn-preset-load');
        const ingestBtn = card.querySelector('.btn-preset-ingest');
        const delBtn = card.querySelector('.btn-preset-del');

        if (loadBtn) {
          loadBtn.addEventListener('click', () => {
            populateForm(p);
            showToast(`Loaded "${p.title}" into form`, 'info');
            if (form) form.scrollIntoView({ behavior: 'smooth' });
          });
        }

        if (ingestBtn) {
          ingestBtn.addEventListener('click', () => {
            populateForm(p);
            const payload = {
              amount: parseFloat(p.amount),
              submitter: p.submitter || 'employee@company.com',
              category: p.category || 'Meals & Entertainment',
              description: p.description || p.title,
              date: new Date().toISOString().split('T')[0],
              currency: 'INR',
            };
            ingestExpense(payload);
          });
        }

        if (delBtn) {
          delBtn.addEventListener('click', () => {
            if (confirm(`Delete preset "${p.title}"?`)) {
              presets = presets.filter((item) => item.id !== p.id);
              savePresets(presets);
              renderPresets();
              showToast(`Preset deleted`, 'info');
            }
          });
        }

        presetsContainer.appendChild(card);
      });
    }

    function populateForm(p) {
      if (amountInput) amountInput.value = p.amount;
      if (submitterInput) submitterInput.value = p.submitter || 'employee@company.com';
      if (categoryInput) categoryInput.value = p.category || 'Meals & Entertainment';
      if (descriptionInput) descriptionInput.value = p.description || '';
      if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Toggle Creator Panel
    if (openCreatePresetBtn && createPresetPanel) {
      openCreatePresetBtn.addEventListener('click', () => {
        createPresetPanel.style.display = 'block';
        if (newPresetTitle) newPresetTitle.focus();
      });
    }

    if (closePresetPanelBtn && createPresetPanel) {
      closePresetPanelBtn.addEventListener('click', () => {
        createPresetPanel.style.display = 'none';
      });
    }

    if (cancelNewPresetBtn && createPresetPanel) {
      cancelNewPresetBtn.addEventListener('click', () => {
        createPresetPanel.style.display = 'none';
      });
    }

    // Save New Custom Preset
    if (saveNewPresetBtn) {
      saveNewPresetBtn.addEventListener('click', () => {
        const title = newPresetTitle ? newPresetTitle.value.trim() : '';
        const amount = newPresetAmount ? parseFloat(newPresetAmount.value) : 0;
        const cat = newPresetCategory ? newPresetCategory.value : 'Meals & Entertainment';
        const submitter = (newPresetSubmitter && newPresetSubmitter.value.trim()) || 'employee@company.com';
        const desc = newPresetDesc ? newPresetDesc.value.trim() : '';

        if (!title || isNaN(amount) || amount <= 0 || !desc) {
          alert('Please enter Title, valid Amount (> 0), and Description.');
          return;
        }

        const newPreset = {
          id: `custom_${Date.now()}`,
          title: title,
          icon: getCategoryIcon(cat),
          amount: amount,
          submitter: submitter,
          category: cat,
          description: desc,
          isDefault: false,
        };

        presets.push(newPreset);
        savePresets(presets);
        renderPresets();

        // Clear panel
        if (newPresetTitle) newPresetTitle.value = '';
        if (newPresetAmount) newPresetAmount.value = '';
        if (newPresetDesc) newPresetDesc.value = '';
        if (createPresetPanel) createPresetPanel.style.display = 'none';

        showToast(`Preset "${newPreset.title}" created successfully!`, 'success');
      });
    }

    // Reset Presets to Standard Defaults
    if (resetPresetsBtn) {
      resetPresetsBtn.addEventListener('click', () => {
        if (confirm('Reset to default presets? Custom presets will be removed.')) {
          presets = [...DEFAULT_PRESETS];
          savePresets(presets);
          renderPresets();
          showToast('Presets reset to default', 'info');
        }
      });
    }

    // Save Current Form as Preset
    if (saveCurrentFormPresetBtn) {
      saveCurrentFormPresetBtn.addEventListener('click', () => {
        const amount = amountInput ? parseFloat(amountInput.value) : 0;
        const cat = categoryInput ? categoryInput.value : 'Meals & Entertainment';
        const desc = descriptionInput ? descriptionInput.value.trim() : '';
        const submitter = submitterInput ? submitterInput.value.trim() : 'employee@company.com';

        if (isNaN(amount) || amount <= 0 || !desc) {
          alert('Please fill out Amount and Description in the form before saving as a preset.');
          return;
        }

        const defaultTitle = desc.length > 22 ? desc.substring(0, 20) + '...' : desc;
        const title = prompt('Enter a label for this preset:', defaultTitle);
        if (!title || !title.trim()) return;

        const newPreset = {
          id: `custom_${Date.now()}`,
          title: title.trim(),
          icon: getCategoryIcon(cat),
          amount: amount,
          submitter: submitter || 'employee@company.com',
          category: cat,
          description: desc,
          isDefault: false,
        };

        presets.push(newPreset);
        savePresets(presets);
        renderPresets();
        showToast(`Saved preset "${newPreset.title}"!`, 'success');
      });
    }

    // -------------------------------------------------------------
    // Ingestion Queue (Batch Mode)
    // -------------------------------------------------------------
    if (addToQueueBtn) {
      addToQueueBtn.addEventListener('click', () => {
        const amount = amountInput ? parseFloat(amountInput.value) : 0;
        const date = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
        const cat = categoryInput ? categoryInput.value : 'Meals & Entertainment';
        const submitter = submitterInput ? submitterInput.value.trim() : '';
        const desc = descriptionInput ? descriptionInput.value.trim() : '';

        if (isNaN(amount) || amount <= 0 || !desc || !submitter) {
          alert('Please enter Amount, Submitter, and Description before adding to queue.');
          return;
        }

        const item = {
          id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          amount,
          date,
          category: cat,
          submitter,
          description: desc,
          currency: 'INR',
        };

        batchQueue.push(item);
        renderQueue();
        showToast(`Added ₹${item.amount.toLocaleString()} to batch queue`, 'info');
      });
    }

    function renderQueue() {
      if (!batchQueueCard || !queueList) return;

      if (batchQueue.length === 0) {
        batchQueueCard.style.display = 'none';
        return;
      }

      batchQueueCard.style.display = 'block';
      if (queueCountBadge) {
        queueCountBadge.textContent = `${batchQueue.length} items`;
      }
      queueList.innerHTML = '';

      batchQueue.forEach((item, index) => {
        const qDiv = document.createElement('div');
        qDiv.className = 'queue-item';
        qDiv.innerHTML = `
          <div class="queue-item-info">
            <span style="font-weight: 700; color: var(--accent-cyan);">${index + 1}.</span>
            <span style="font-weight: 700; color: #f1f5f9;">₹${item.amount.toLocaleString()}</span>
            <span style="color: var(--text-muted);">• ${escapeHtml(item.category)}</span>
            <span style="color: var(--text-subtle); font-size: 11px;">(${escapeHtml(item.submitter)})</span>
          </div>
          <button type="button" class="queue-item-del" data-id="${item.id}" title="Remove item">✕</button>
        `;

        const delBtn = qDiv.querySelector('.queue-item-del');
        if (delBtn) {
          delBtn.addEventListener('click', () => {
            batchQueue = batchQueue.filter((q) => q.id !== item.id);
            renderQueue();
          });
        }

        queueList.appendChild(qDiv);
      });
    }

    if (clearQueueBtn) {
      clearQueueBtn.addEventListener('click', () => {
        batchQueue = [];
        renderQueue();
      });
    }

    if (ingestQueueBtn) {
      ingestQueueBtn.addEventListener('click', async () => {
        if (batchQueue.length === 0) return;

        ingestQueueBtn.disabled = true;
        ingestQueueBtn.innerHTML = '<span>⏳ Ingesting Queue via ADK 2.0...</span>';

        try {
          const itemsToProcess = [...batchQueue];
          for (let i = 0; i < itemsToProcess.length; i++) {
            const item = itemsToProcess[i];
            await ingestExpense(item);
            if (i < itemsToProcess.length - 1) {
              await new Promise((r) => setTimeout(r, 700));
            }
          }
          batchQueue = [];
          renderQueue();
          showToast(`All ${itemsToProcess.length} queued events processed!`, 'success');
        } catch (err) {
          showToast(`Queue processing error: ${err.message}`, 'error');
        } finally {
          ingestQueueBtn.disabled = false;
          ingestQueueBtn.innerHTML = '<span>⚡ Ingest All Queued Events</span>';
        }
      });
    }

    // -------------------------------------------------------------
    // Core Workflow Ingestion Handler
    // -------------------------------------------------------------
    async function ingestExpense(payload) {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>⏳ Ingesting via ADK 2.0...</span>';
      }

      try {
        resetGraphNodes();
        if (nodeStart) nodeStart.classList.add('active');
        if (graphStateLabel) graphStateLabel.textContent = 'Processing: START Node';

        const res = await fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `Server returned status ${res.status}`);
        }

        const result = await res.json();
        animateWorkflowResult(result);
        await fetchHistoryAndStats();

        if (result.status === 'AUTO_APPROVED') {
          showToast(`₹${payload.amount.toLocaleString()} Auto-Approved (Zero LLM)!`, 'success');
        } else if (result.status === 'PENDING_HUMAN_APPROVAL') {
          showToast(`₹${payload.amount.toLocaleString()} Paused: Human Review Required!`, 'info');
        }

        return result;
      } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
        resetGraphNodes();
        throw err;
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>🚀 Ingest Expense Event</span>';
        }
      }
    }

    // Attach Click and Form Handlers
    function handleFormSubmit(e) {
      if (e) e.preventDefault();

      const amountVal = amountInput ? parseFloat(amountInput.value) : 0;
      const submitterVal = submitterInput ? submitterInput.value.trim() : '';
      const categoryVal = categoryInput ? categoryInput.value : '';
      const descVal = descriptionInput ? descriptionInput.value.trim() : '';
      const dateVal = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];

      if (isNaN(amountVal) || amountVal <= 0) {
        alert('Please enter a valid expense Amount greater than 0.');
        if (amountInput) amountInput.focus();
        return false;
      }

      if (!submitterVal) {
        alert('Please enter the Submitter Email.');
        if (submitterInput) submitterInput.focus();
        return false;
      }

      if (!descVal) {
        alert('Please provide a Business Justification / Description.');
        if (descriptionInput) descriptionInput.focus();
        return false;
      }

      const payload = {
        amount: amountVal,
        submitter: submitterVal,
        category: categoryVal,
        description: descVal,
        date: dateVal,
        currency: 'INR',
      };

      ingestExpense(payload);
      return false;
    }

    if (form) {
      form.addEventListener('submit', handleFormSubmit);
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', handleFormSubmit);
    }

    // -------------------------------------------------------------
    // Human Review Handlers (HITL)
    // -------------------------------------------------------------
    if (approveBtn) {
      approveBtn.addEventListener('click', () => handleHumanDecision('APPROVE'));
    }

    if (rejectBtn) {
      rejectBtn.addEventListener('click', () => handleHumanDecision('REJECT'));
    }

    async function handleHumanDecision(action) {
      if (!activePausedSession) return;

      if (approveBtn) approveBtn.disabled = true;
      if (rejectBtn) rejectBtn.disabled = true;

      try {
        const notes = hitlNotesInput ? hitlNotesInput.value.trim() : '';
        const decisionPayload = {
          invocation_id: activePausedSession.invocation_id,
          interrupt_id: activePausedSession.interrupt_id,
          action: action,
          reviewer_notes: notes || `Processed as ${action} via dashboard`,
          reviewer_id: 'manager_web',
        };

        const res = await fetch(`/api/expenses/${activePausedSession.session_id}/decision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(decisionPayload),
        });

        if (!res.ok) {
          throw new Error(`Server returned status ${res.status}`);
        }

        const finalResult = await res.json();

        // Finalize graph node
        if (nodeHitl) nodeHitl.classList.remove('paused');
        if (nodeFinalize) nodeFinalize.classList.add(action === 'APPROVE' ? 'success' : 'active');
        if (graphStateLabel) graphStateLabel.textContent = `Completed: ${finalResult.status}`;

        // Hide HITL card
        if (hitlCard) hitlCard.style.display = 'none';
        activePausedSession = null;
        if (hitlNotesInput) hitlNotesInput.value = '';

        await fetchHistoryAndStats();
        showToast(`Workflow completed: Expense ${finalResult.status}!`, 'success');
      } catch (err) {
        showToast(`Failed to resume workflow: ${err.message}`, 'error');
      } finally {
        if (approveBtn) approveBtn.disabled = false;
        if (rejectBtn) rejectBtn.disabled = false;
      }
    }

    // -------------------------------------------------------------
    // Visualizer Animations
    // -------------------------------------------------------------
    function animateWorkflowResult(result) {
      resetGraphNodes();
      if (nodeStart) nodeStart.classList.add('active');

      setTimeout(() => {
        if (nodeThreshold) nodeThreshold.classList.add('active');

        setTimeout(() => {
          if (result.status === 'AUTO_APPROVED') {
            if (nodeAuto) nodeAuto.classList.add('success');
            if (graphStateLabel) graphStateLabel.textContent = 'Auto-Approved: Zero LLM Calls (< ₹1,000)';
            if (hitlCard) hitlCard.style.display = 'none';
            activePausedSession = null;
          } else if (result.status === 'PENDING_HUMAN_APPROVAL') {
            if (nodeLlm) nodeLlm.classList.add('active');
            setTimeout(() => {
              if (nodeHitl) nodeHitl.classList.add('paused');
              if (graphStateLabel) graphStateLabel.textContent = 'Workflow Paused: Awaiting Human Decision';
              showHitlCard(result);
            }, 300);
          }
        }, 300);
      }, 250);
    }

    function resetGraphNodes() {
      [nodeStart, nodeThreshold, nodeAuto, nodeLlm, nodeHitl, nodeFinalize].forEach((n) => {
        if (n) n.className = 'graph-node';
      });
      if (graphStateLabel) graphStateLabel.textContent = 'Workflow Active';
    }

    function showHitlCard(result) {
      activePausedSession = result;
      const risk = result.risk_assessment || {};
      const exp = result.expense || {};

      if (hitlSessionBadge) {
        hitlSessionBadge.textContent = `Session: ${result.session_id.substring(0, 8)}...`;
      }
      if (hitlRiskScore) {
        hitlRiskScore.textContent = risk.risk_score !== undefined ? risk.risk_score.toFixed(2) : '--';
      }
      if (hitlRiskBadge) {
        hitlRiskBadge.textContent = risk.risk_level || 'UNKNOWN';

        if (risk.risk_level === 'HIGH') {
          hitlRiskBadge.style.background = 'rgba(244, 63, 94, 0.2)';
          hitlRiskBadge.style.color = '#fb7185';
          if (hitlRiskScore) hitlRiskScore.style.color = '#fb7185';
        } else if (risk.risk_level === 'MEDIUM') {
          hitlRiskBadge.style.background = 'rgba(245, 158, 11, 0.2)';
          hitlRiskBadge.style.color = '#fbbf24';
          if (hitlRiskScore) hitlRiskScore.style.color = '#fbbf24';
        } else {
          hitlRiskBadge.style.background = 'rgba(16, 185, 129, 0.2)';
          hitlRiskBadge.style.color = '#34d399';
          if (hitlRiskScore) hitlRiskScore.style.color = '#34d399';
        }
      }

      if (hitlExpenseInfo) {
        hitlExpenseInfo.textContent = `₹${exp.amount ? exp.amount.toLocaleString() : 0} • ${exp.category || ''} (${exp.submitter || ''})`;
      }
      if (hitlRecommendation) {
        hitlRecommendation.textContent = risk.recommendation || 'NEEDS_VERIFICATION';
      }
      if (hitlRationale) {
        hitlRationale.textContent = risk.analysis_summary || 'Risk assessment completed by Gemini.';
      }

      if (hitlFlagsList) {
        hitlFlagsList.innerHTML = '';
        const flags = risk.flags || [];
        if (flags.length === 0) {
          hitlFlagsList.innerHTML = '<span style="font-size: 11px; color: var(--text-subtle);">No policy flags detected</span>';
        } else {
          flags.forEach((f) => {
            const chip = document.createElement('span');
            chip.className = 'flag-chip';
            chip.textContent = f;
            hitlFlagsList.appendChild(chip);
          });
        }
      }

      if (hitlCard) {
        hitlCard.style.display = 'block';
        hitlCard.scrollIntoView({ behavior: 'smooth' });
      }
    }

    // -------------------------------------------------------------
    // Fetch History & Aggregated Stats
    // -------------------------------------------------------------
    if (refreshHistoryBtn) {
      refreshHistoryBtn.addEventListener('click', () => {
        fetchHistoryAndStats();
        showToast('Refreshed audit history', 'info');
      });
    }

    async function fetchHistoryAndStats() {
      try {
        const [resHistory, resStats] = await Promise.all([
          fetch('/api/expenses'),
          fetch('/api/stats'),
        ]);

        if (resHistory.ok) {
          const history = await resHistory.json();
          renderAuditTable(history);
        }

        if (resStats.ok) {
          const stats = await resStats.json();
          renderStats(stats);
        }
      } catch (err) {
        console.warn('Could not fetch stats/history:', err);
      }
    }

    function renderStats(stats) {
      if (statTotal) statTotal.textContent = stats.total_processed || 0;
      if (statAuto) statAuto.textContent = stats.auto_approved || 0;
      if (statHuman) statHuman.textContent = (stats.human_approved || 0) + (stats.pending_human_review || 0);
      if (statVolume) {
        statVolume.textContent = `₹${(stats.total_amount_inr || 0).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
      }
    }

    function renderAuditTable(history) {
      if (!auditTbody) return;

      if (!history || history.length === 0) {
        auditTbody.innerHTML = `
          <tr>
            <td colspan="6" class="empty-state">
              No expense reports ingested yet. Submit an event above or select a preset.
            </td>
          </tr>
        `;
        return;
      }

      auditTbody.innerHTML = '';
      history.forEach((item) => {
        const tr = document.createElement('tr');
        const exp = item.expense || {};
        const status = item.status || 'UNKNOWN';

        let statusBadgeClass = 'status-auto';
        let statusLabel = status;

        if (status === 'AUTO_APPROVED') {
          statusBadgeClass = 'status-auto';
          statusLabel = '⚡ Auto Approved';
        } else if (status === 'PENDING_HUMAN_APPROVAL') {
          statusBadgeClass = 'status-pending';
          statusLabel = '⏸️ Awaiting Human Review';
        } else if (status === 'APPROVED') {
          statusBadgeClass = 'status-approved';
          statusLabel = '✓ Approved by Manager';
        } else if (status === 'REJECTED') {
          statusBadgeClass = 'status-rejected';
          statusLabel = '✕ Rejected';
        }

        const formattedAmount = `₹${exp.amount ? exp.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}`;

        tr.innerHTML = `
          <td><span class="status-badge ${statusBadgeClass}">${statusLabel}</span></td>
          <td class="amount-cell">${formattedAmount}</td>
          <td>${escapeHtml(exp.submitter || 'N/A')}</td>
          <td>${escapeHtml(exp.category || 'N/A')}</td>
          <td style="font-size: 12px;">${escapeHtml(item.reason || (item.risk_assessment ? item.risk_assessment.analysis_summary : 'Processing...'))}</td>
          <td>${item.completed_at ? item.completed_at.substring(0, 10) : (exp.date || '--')}</td>
        `;

        auditTbody.appendChild(tr);
      });
    }

    function escapeHtml(str) {
      if (typeof str !== 'string') return String(str || '');
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // -------------------------------------------------------------
    // Initial Render
    // -------------------------------------------------------------
    renderPresets();
    fetchHistoryAndStats();
  }

  // Safe DOM ready execution
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
