/**
 * Ambient Expense-Approval Agent (ADK 2.0) - Frontend Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const form = document.getElementById('expense-form');
  const amountInput = document.getElementById('amount-input');
  const dateInput = document.getElementById('date-input');
  const submitterInput = document.getElementById('submitter-input');
  const categoryInput = document.getElementById('category-input');
  const descriptionInput = document.getElementById('description-input');
  const submitBtn = document.getElementById('submit-expense-btn');

  // Presets
  const presetSmallBtn = document.getElementById('preset-small-btn');
  const presetLargeBtn = document.getElementById('preset-large-btn');
  const presetFlaggedBtn = document.getElementById('preset-flagged-btn');

  // Stats
  const statTotal = document.getElementById('stat-total');
  const statAuto = document.getElementById('stat-auto');
  const statHuman = document.getElementById('stat-human');
  const statVolume = document.getElementById('stat-volume');

  // Graph nodes
  const nodeStart = document.getElementById('node-start');
  const nodeThreshold = document.getElementById('node-threshold');
  const nodeAuto = document.getElementById('node-auto');
  const nodeLlm = document.getElementById('node-llm');
  const nodeHitl = document.getElementById('node-hitl');
  const nodeFinalize = document.getElementById('node-finalize');
  const graphStateLabel = document.getElementById('graph-state-label');

  // HITL card elements
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

  // Table elements
  const auditTbody = document.getElementById('audit-tbody');
  const refreshHistoryBtn = document.getElementById('refresh-history-btn');

  // State
  let activePausedSession = null;

  // Set default date to today
  dateInput.value = new Date().toISOString().split('T')[0];

  // Presets configuration
  const presets = {
    small: {
      amount: 420.0,
      submitter: 'amit.patel@acme.corp',
      category: 'Meals & Entertainment',
      description: 'Afternoon tea and snacks for client technical workshop',
    },
    large: {
      amount: 5400.0,
      submitter: 'sneha.kulkarni@acme.corp',
      category: 'Cloud Infrastructure',
      description: 'Monthly reserved cloud compute cluster for AI evaluation benchmark',
    },
    flagged: {
      amount: 14500.0,
      submitter: 'dev.kapoor@acme.corp',
      category: 'Gifts & Miscellaneous',
      description: 'Personal luxury festival gift hamper for client executives',
    },
  };

  function applyPreset(p) {
    amountInput.value = p.amount;
    submitterInput.value = p.submitter;
    categoryInput.value = p.category;
    descriptionInput.value = p.description;
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  presetSmallBtn.addEventListener('click', () => {
    applyPreset(presets.small);
    submitBtn.scrollIntoView({ behavior: 'smooth' });
  });

  presetLargeBtn.addEventListener('click', () => {
    applyPreset(presets.large);
    submitBtn.scrollIntoView({ behavior: 'smooth' });
  });

  presetFlaggedBtn.addEventListener('click', () => {
    applyPreset(presets.flagged);
    submitBtn.scrollIntoView({ behavior: 'smooth' });
  });

  refreshHistoryBtn.addEventListener('click', fetchHistoryAndStats);

  // Form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      amount: parseFloat(amountInput.value),
      submitter: submitterInput.value.trim(),
      category: categoryInput.value,
      description: descriptionInput.value.trim(),
      date: dateInput.value,
      currency: 'INR',
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳ Processing via ADK 2.0...</span>';

    try {
      resetGraphNodes();
      // Animate START
      nodeStart.classList.add('active');
      graphStateLabel.textContent = 'Processing: START';

      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const result = await res.json();
      animateWorkflowResult(result);
      fetchHistoryAndStats();
    } catch (err) {
      alert(`Error ingesting expense: ${err.message}`);
      resetGraphNodes();
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>🚀 Ingest Expense Event</span>';
    }
  });

  // Human Review Handlers
  approveBtn.addEventListener('click', () => handleHumanDecision('APPROVE'));
  rejectBtn.addEventListener('click', () => handleHumanDecision('REJECT'));

  async function handleHumanDecision(action) {
    if (!activePausedSession) return;

    approveBtn.disabled = true;
    rejectBtn.disabled = true;

    try {
      const decisionPayload = {
        invocation_id: activePausedSession.invocation_id,
        interrupt_id: activePausedSession.interrupt_id,
        action: action,
        reviewer_notes: hitlNotesInput.value.trim() || `Processed as ${action} via dashboard`,
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
      nodeHitl.classList.remove('paused');
      nodeFinalize.classList.add(action === 'APPROVE' ? 'success' : 'active');
      graphStateLabel.textContent = `Completed: ${finalResult.status}`;

      // Hide HITL card
      hitlCard.style.display = 'none';
      activePausedSession = null;
      hitlNotesInput.value = '';

      fetchHistoryAndStats();
    } catch (err) {
      alert(`Failed to resume workflow: ${err.message}`);
    } finally {
      approveBtn.disabled = false;
      rejectBtn.disabled = false;
    }
  }

  // Node animation based on ADK 2.0 result
  function animateWorkflowResult(result) {
    resetGraphNodes();
    nodeStart.classList.add('active');

    setTimeout(() => {
      nodeThreshold.classList.add('active');

      setTimeout(() => {
        if (result.status === 'AUTO_APPROVED') {
          // Fast-path: Auto Approve (Under 1000 INR)
          nodeAuto.classList.add('success');
          graphStateLabel.textContent = 'Auto-Approved: Zero LLM Calls (< ₹1,000)';
          hitlCard.style.display = 'none';
          activePausedSession = null;
        } else if (result.status === 'PENDING_HUMAN_APPROVAL') {
          // Escalated path: LLM Review -> Pause via RequestInput
          nodeLlm.classList.add('active');
          setTimeout(() => {
            nodeHitl.classList.add('paused');
            graphStateLabel.textContent = 'Workflow Paused: Awaiting Human Decision';
            showHitlCard(result);
          }, 300);
        }
      }, 300);
    }, 250);
  }

  function resetGraphNodes() {
    [nodeStart, nodeThreshold, nodeAuto, nodeLlm, nodeHitl, nodeFinalize].forEach((n) => {
      n.className = 'graph-node';
    });
    graphStateLabel.textContent = 'Workflow Active';
  }

  function showHitlCard(result) {
    activePausedSession = result;
    const risk = result.risk_assessment || {};
    const exp = result.expense || {};

    hitlSessionBadge.textContent = `Session: ${result.session_id.substring(0, 8)}...`;
    hitlRiskScore.textContent = risk.risk_score !== undefined ? risk.risk_score.toFixed(2) : '--';
    hitlRiskBadge.textContent = risk.risk_level || 'UNKNOWN';

    // Style risk badge by level
    if (risk.risk_level === 'HIGH') {
      hitlRiskBadge.style.background = 'rgba(244, 63, 94, 0.2)';
      hitlRiskBadge.style.color = '#fb7185';
      hitlRiskScore.style.color = '#fb7185';
    } else if (risk.risk_level === 'MEDIUM') {
      hitlRiskBadge.style.background = 'rgba(245, 158, 11, 0.2)';
      hitlRiskBadge.style.color = '#fbbf24';
      hitlRiskScore.style.color = '#fbbf24';
    } else {
      hitlRiskBadge.style.background = 'rgba(16, 185, 129, 0.2)';
      hitlRiskBadge.style.color = '#34d399';
      hitlRiskScore.style.color = '#34d399';
    }

    hitlExpenseInfo.textContent = `₹${exp.amount ? exp.amount.toLocaleString() : 0} • ${exp.category} (${exp.submitter})`;
    hitlRecommendation.textContent = risk.recommendation || 'NEEDS_VERIFICATION';
    hitlRationale.textContent = risk.analysis_summary || 'Risk assessment completed by Gemini.';

    // Flags
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

    hitlCard.style.display = 'block';
    hitlCard.scrollIntoView({ behavior: 'smooth' });
  }

  // Fetch History and Stats
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
    statTotal.textContent = stats.total_processed || 0;
    statAuto.textContent = stats.auto_approved || 0;
    statHuman.textContent = (stats.human_approved || 0) + (stats.pending_human_review || 0);
    statVolume.textContent = `₹${(stats.total_amount_inr || 0).toLocaleString()}`;
  }

  function renderAuditTable(history) {
    if (!history || history.length === 0) {
      auditTbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">
            No expense reports ingested yet. Submit an event above or select a 1-click preset.
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
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initial fetch
  fetchHistoryAndStats();
});
