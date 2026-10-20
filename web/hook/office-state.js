// Claude Code 훅 이벤트 → 사무실 세션 상태.
// 각자 PC의 훅(Node)과 웹 데모 모드(브라우저)가 같이 쓴다.
(function (root) {
  const TOOL_STATE = {
    Read: 'read', Grep: 'read', Glob: 'read', LS: 'read', NotebookRead: 'read',
    Bash: 'bash', BashOutput: 'bash', KillShell: 'bash', KillBash: 'bash', Monitor: 'bash',
    Edit: 'edit', Write: 'edit', MultiEdit: 'edit', NotebookEdit: 'edit',
    WebFetch: 'web', WebSearch: 'web',
    TodoWrite: 'plan', Task: 'plan', Agent: 'plan', EnterPlanMode: 'plan',
    AskUserQuestion: 'wait', ExitPlanMode: 'wait',
  };
  const SUBAGENT_TOOLS = ['Task', 'Agent'];
  const LOG_SIZE = 8;

  function stateForTool(name) {
    name = name || '';
    if (TOOL_STATE[name]) return TOOL_STATE[name];
    if (name.startsWith('mcp__')) return 'web';
    return 'think';
  }
  function clip(s, n) {
    n = n || 34;
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  const basename = p => String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop();

  function detailFor(tool, input, show) {
    if (!show) return '';
    input = input || {};
    if (input.file_path || input.notebook_path) return basename(input.file_path || input.notebook_path);
    if (input.command) return clip(input.command, 30);
    if (input.pattern) return clip(input.pattern, 30);
    if (input.url) { const m = /^\w+:\/\/([^/]+)/.exec(input.url); return m ? m[1] : clip(input.url); }
    if (input.query) return clip(input.query, 30);
    if (input.description) return clip(input.description, 30);
    if (tool.startsWith('mcp__')) return tool.split('__').slice(1).join(' · ');
    return '';
  }

  // 서브에이전트 이벤트에는 agent_id가 붙어 온다. 처음 보는 agent_id는 아직 배정 안 된 서브에이전트에 묶는다.
  function getSub(s, agentId, agentType) {
    let sub = s.subs.find(x => x.agentId === agentId);
    if (!sub) { sub = s.subs.find(x => !x.agentId); if (sub) sub.agentId = agentId; }
    if (!sub) {
      sub = { id: s.id + ':' + agentId, agentId, toolUseId: null, desc: agentType || '서브에이전트', state: 'think', tool: '', detail: '' };
      s.subs.push(sub);
    }
    if (agentType && sub.desc === '서브에이전트') sub.desc = agentType;
    return sub;
  }

  // 반환: { session, write(서버에 보낼지), deleted }
  function applyEvent(s, ev, opts) {
    opts = opts || {};
    const now = opts.now || Date.now();
    const show = opts.showDetails !== false;
    const name = ev.hook_event_name;
    if (!s) s = { id: ev.session_id, project: '', state: 'idle', tool: '', detail: '', subs: [], firstSeen: now, updatedAt: now, seq: 0, log: [] };
    if (ev.cwd) s.project = basename(ev.cwd);
    const log = (actor, text) => {
      s.log.unshift({ t: now, who: actor === s ? '' : actor.desc, text });
      s.log.length = Math.min(s.log.length, LOG_SIZE);
    };
    const actor = ev.agent_id && name !== 'SubagentStart' && name !== 'SubagentStop' ? getSub(s, ev.agent_id, ev.agent_type) : s;
    let write = true;

    switch (name) {
      case 'SessionStart':
        s.state = 'idle'; s.tool = ''; s.detail = '';
        log(s, '출근했습니다');
        break;
      case 'UserPromptSubmit':
        s.state = 'think'; s.tool = ''; s.detail = '새 지시 받음';
        log(s, '새 지시를 받았습니다');
        break;
      case 'PreToolUse': {
        const tool = ev.tool_name || '';
        const input = ev.tool_input || {};
        if (SUBAGENT_TOOLS.includes(tool) && actor === s) {
          s.subs.push({ id: ev.tool_use_id || s.id + ':' + now, toolUseId: ev.tool_use_id || null, agentId: null,
            desc: clip(input.description || input.subagent_type || '서브에이전트', 18), state: 'think', tool: '', detail: '' });
          log(s, '서브에이전트 호출: ' + clip(input.description || '', 24));
        }
        actor.state = stateForTool(tool);
        actor.tool = tool.startsWith('mcp__') ? 'MCP' : tool;
        actor.detail = detailFor(tool, input, show);
        log(actor, actor.tool + (actor.detail ? ' · ' + actor.detail : ''));
        break;
      }
      case 'PostToolUse':
      case 'PostToolUseFailure': {
        const tool = ev.tool_name || '';
        if (SUBAGENT_TOOLS.includes(tool) && actor === s) {
          s.subs = s.subs.filter(x => x.toolUseId !== ev.tool_use_id);
        } else if (actor.state === 'wait') {
          // 승인 후 도구가 끝났다 → 다시 생각 중
          actor.state = 'think'; actor.tool = ''; actor.detail = '';
        } else {
          // 도구가 끝났다는 것만으로는 저장하지 않는다 (Firestore 쓰기 절약). 다음 도구나 완료 때 갱신된다.
          write = false;
        }
        break;
      }
      case 'Notification': {
        // 작업이 끝난 뒤 오는 "입력 기다리는 중" 알림은 휴식 상태 그대로 둔다
        if (s.state === 'idle' || /waiting for your input/i.test(ev.message || '')) { write = false; break; }
        const m = /permission to use (\S+)/i.exec(ev.message || '');
        s.state = 'wait'; s.tool = '';
        s.detail = m ? m[1] + ' 사용 승인 필요' : show ? clip(ev.message || '확인 필요', 30) : '확인 필요';
        log(s, '🙋 ' + s.detail);
        break;
      }
      case 'SubagentStart':
        getSub(s, ev.agent_id, ev.agent_type);
        break;
      case 'SubagentStop':
        s.subs = s.subs.filter(x => x.agentId !== ev.agent_id);
        break;
      case 'Stop':
        s.state = 'idle'; s.tool = ''; s.detail = ''; s.subs = [];
        log(s, '작업 완료, 커피 타임 ☕');
        break;
      case 'PreCompact':
        s.state = 'think'; s.tool = ''; s.detail = '기억 정리 중';
        break;
      case 'SessionEnd':
        return { session: s, write: true, deleted: true };
      default:
        write = false;
    }
    if (write) { s.updatedAt = now; s.seq = (s.seq || 0) + 1; }
    return { session: s, write, deleted: false };
  }

  // ------------------------------------------------------------------
  //  업무일지: 하루 동안의 활동을 프로젝트별로 모은다 (이 PC에 쌓고 가끔 올림)
  // ------------------------------------------------------------------
  const pad = n => String(n).padStart(2, '0');
  function dayOf(ms) { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addUniq(list, v, max) { if (!v || list.includes(v)) return; list.push(v); if (list.length > max) list.shift(); }
  const TRIVIAL_CMD = /^(ls|cd|pwd|cat|echo|head|tail|which|clear|true|sleep)\b/;
  const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];

  function commitMessage(cmd) {
    if (!/\bgit\s+commit\b/.test(cmd)) return '';
    const heredoc = /<<-?\s*'?(\w+)'?\s*\n([\s\S]*?)\n\s*\1/.exec(cmd);
    if (heredoc) return heredoc[2].trim().split('\n')[0];
    const m = /\s-m\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+))/.exec(cmd);
    return m ? (m[1] || m[2] || m[3] || '').split('\n')[0] : '';
  }

  // 반환: { journal, flush(지금 올릴지) }
  function applyJournal(j, ev, opts) {
    opts = opts || {};
    const now = opts.now || Date.now(), day = dayOf(now), show = opts.showDetails !== false;
    if (!j || j.day !== day) j = { day, first: now, last: now, activeMs: 0, seq: 0, uploadedAt: 0, projects: [] };
    const gap = now - j.last;
    if (gap > 0 && gap < 5 * 60_000) j.activeMs += gap; // 5분 넘게 조용했으면 쉰 걸로 본다
    j.last = now;
    const pname = ev.cwd ? basename(ev.cwd) : (j.projects[0] && j.projects[0].name) || '기타';
    let p = j.projects.find(x => x.name === pname);
    if (!p) { p = { name: pname, prompts: 0, done: 0, subagents: 0, tools: {}, files: [], commands: [], commits: [], web: [], asks: [] }; j.projects.push(p); }
    const name = ev.hook_event_name, input = ev.tool_input || {};
    if (name === 'UserPromptSubmit') {
      p.prompts++;
      if (opts.journalPrompts && ev.prompt) addUniq(p.asks, clip(ev.prompt, 80), 20);
    } else if (name === 'PreToolUse') {
      const tool = (ev.tool_name || '').startsWith('mcp__') ? 'MCP' : ev.tool_name || '?';
      p.tools[tool] = (p.tools[tool] || 0) + 1;
      if ((tool === 'Agent' || tool === 'Task') && !ev.agent_id) p.subagents++;
      if (show) {
        if (EDIT_TOOLS.includes(tool) && (input.file_path || input.notebook_path)) addUniq(p.files, basename(input.file_path || input.notebook_path), 40);
        if (tool === 'Bash' && input.command) {
          const msg = commitMessage(input.command);
          if (msg) addUniq(p.commits, clip(msg, 80), 20);
          else if (!TRIVIAL_CMD.test(input.command.trim())) addUniq(p.commands, clip(input.command.split('\n')[0], 50), 20);
        }
        if (tool === 'WebSearch' && input.query) addUniq(p.web, clip(input.query, 50), 15);
        if (tool === 'WebFetch' && input.url) { const m = /^\w+:\/\/([^/]+)/.exec(input.url); if (m) addUniq(p.web, m[1], 15); }
      }
    } else if (name === 'Stop') {
      p.done++;
    }
    const flush = name === 'Stop' || name === 'SessionEnd' || now - j.uploadedAt > 10 * 60_000;
    if (flush) { j.uploadedAt = now; j.seq++; }
    return { journal: j, flush };
  }

  const api = { applyEvent, stateForTool, applyJournal, dayOf, commitMessage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OfficeState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
