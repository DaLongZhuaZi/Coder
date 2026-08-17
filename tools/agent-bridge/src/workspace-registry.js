'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomId } = require('./daemon-store');
const { readString } = require('./protocol');

function normalizePath(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return '';
  }
  return path.resolve(value);
}

function projectIdForPath(cwd) {
  if (cwd.length === 0) {
    return 'project:unknown';
  }
  return 'project:' + cwd.toLowerCase();
}

function displayNameForPath(cwd) {
  if (cwd.length === 0) {
    return 'Workspace';
  }
  const name = path.basename(cwd);
  return name.length > 0 ? name : cwd;
}

function readBoolean(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'boolean' ? value : fallbackValue;
}

function readNumber(source, key, fallbackValue) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return fallbackValue;
  }
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallbackValue;
}

function nowIso() {
  return new Date().toISOString();
}

function emptyValidation(code, message, remediation) {
  return {
    ok: false,
    code,
    message,
    remediation: remediation || '',
    errors: message ? [message] : [],
    warnings: []
  };
}

function okValidation(message, warnings) {
  return {
    ok: true,
    code: 'ok',
    message: message || 'Workspace path is valid.',
    remediation: '',
    errors: [],
    warnings: Array.isArray(warnings) ? warnings : []
  };
}

function workspaceStatusFor(workspace, validation) {
  if (workspace && typeof workspace.archivedAt === 'string' && workspace.archivedAt.length > 0) {
    return 'archived';
  }
  if (validation && validation.code === 'path_missing') {
    return 'missing';
  }
  if (validation && validation.ok !== true) {
    return 'stale';
  }
  return 'active';
}

class WorkspaceRegistry {
  constructor(store) {
    this.store = store;
  }

  listProjects() {
    return this.decorateProjects(this.store.readProjectRegistry(), this.listWorkspaces({
      includeArchived: true,
      validate: true
    }));
  }

  listWorkspaces(payload) {
    const includeArchived = readBoolean(payload, 'includeArchived', false);
    const validate = readBoolean(payload, 'validate', true);
    const workspaces = this.store.readWorkspaceRegistry();
    const filtered = [];
    for (const workspace of workspaces) {
      if (!workspace) {
        continue;
      }
      if (!includeArchived && (workspace.archivedAt !== null && workspace.archivedAt !== undefined && workspace.archivedAt !== '')) {
        continue;
      }
      filtered.push(this.decorateWorkspace(workspace, validate));
    }
    return filtered;
  }

  listResult(payload) {
    const includeArchived = readBoolean(payload, 'includeArchived', false);
    const workspaces = this.listWorkspaces({
      includeArchived,
      validate: true
    });
    const allWorkspaces = includeArchived ? workspaces : this.listWorkspaces({
      includeArchived: true,
      validate: true
    });
    return {
      ok: true,
      action: 'workspace.registry.list',
      preview: false,
      confirmed: true,
      projects: this.decorateProjects(this.store.readProjectRegistry(), allWorkspaces),
      workspaces,
      suggestions: this.listDirectorySuggestions(payload),
      checks: this.doctor(payload).checks,
      updatedAt: Date.now()
    };
  }

  upsertWorkspaceForPath(workspacePath, workspaceTitle) {
    return this.upsertWorkspace({
      workspacePath,
      cwd: workspacePath,
      workspaceTitle,
      title: workspaceTitle,
      dedupeByCwd: true
    });
  }

  createWorkspace(payload) {
    return this.writeWorkspaceWithPreview(payload, 'workspace.registry.create', 'create');
  }

  importWorkspace(payload) {
    return this.writeWorkspaceWithPreview(payload, 'workspace.registry.import', 'import');
  }

  upsertWorkspace(payload) {
    const explicitWorkspaceId = readString(payload, 'workspaceId', '');
    const workspacePath = readString(payload, 'workspacePath', readString(payload, 'cwd', ''));
    const workspaceTitle = readString(payload, 'workspaceTitle', readString(payload, 'title', ''));
    const workspaceKind = readString(payload, 'kind', 'directory');
    const branch = readString(payload, 'branch', '');
    const sourceWorkspaceId = readString(payload, 'sourceWorkspaceId', '');
    const sourceRootPath = normalizePath(readString(payload, 'sourceRootPath', ''));
    const worktreePath = normalizePath(readString(payload, 'worktreePath', ''));
    const startPoint = readString(payload, 'startPoint', '');
    const dedupeByCwd = readBoolean(payload, 'dedupeByCwd', explicitWorkspaceId.length === 0);
    const cwd = normalizePath(workspacePath);
    if (cwd.length === 0) {
      return null;
    }
    const now = new Date().toISOString();
    const projectId = projectIdForPath(cwd);
    const projects = this.listProjects();
    let project = null;
    for (const item of projects) {
      if (item && item.projectId === projectId) {
        project = item;
        break;
      }
    }
    if (!project) {
      project = {
        projectId,
        rootPath: cwd,
        kind: 'directory',
        displayName: displayNameForPath(cwd),
        createdAt: now,
        updatedAt: now,
        archivedAt: null
      };
      projects.push(project);
    } else {
      project.updatedAt = now;
      project.archivedAt = null;
    }
    this.store.writeProjectRegistry(projects);

    const workspaces = this.store.readWorkspaceRegistry();
    if (explicitWorkspaceId.length > 0) {
      for (const workspace of workspaces) {
        if (workspace && workspace.workspaceId === explicitWorkspaceId) {
          workspace.projectId = projectId;
          workspace.cwd = cwd;
          workspace.kind = workspaceKind.length > 0 ? workspaceKind : 'directory';
          workspace.displayName = displayNameForPath(cwd);
          workspace.updatedAt = now;
          workspace.archivedAt = null;
          workspace.title = workspaceTitle.length > 0 ? workspaceTitle : workspace.title;
          if (branch.length > 0) {
            workspace.branch = branch;
          }
          if (sourceWorkspaceId.length > 0) {
            workspace.sourceWorkspaceId = sourceWorkspaceId;
          }
          if (sourceRootPath.length > 0) {
            workspace.sourceRootPath = sourceRootPath;
          }
          if (worktreePath.length > 0) {
            workspace.worktreePath = worktreePath;
          }
          if (startPoint.length > 0) {
            workspace.startPoint = startPoint;
          }
          this.store.writeWorkspaceRegistry(workspaces);
          return workspace;
        }
      }
    }

    if (dedupeByCwd) {
      for (const workspace of workspaces) {
        if (workspace && workspace.cwd === cwd && workspace.archivedAt === null) {
          workspace.updatedAt = now;
          if (typeof workspaceTitle === 'string' && workspaceTitle.length > 0) {
            workspace.title = workspaceTitle;
          }
          if (branch.length > 0) {
            workspace.branch = branch;
          }
          if (sourceWorkspaceId.length > 0) {
            workspace.sourceWorkspaceId = sourceWorkspaceId;
          }
          if (sourceRootPath.length > 0) {
            workspace.sourceRootPath = sourceRootPath;
          }
          if (worktreePath.length > 0) {
            workspace.worktreePath = worktreePath;
          }
          if (startPoint.length > 0) {
            workspace.startPoint = startPoint;
          }
          this.store.writeWorkspaceRegistry(workspaces);
          return workspace;
        }
      }
    }

    const workspace = {
      workspaceId: explicitWorkspaceId.length > 0 ? explicitWorkspaceId : randomId('wks'),
      projectId,
      cwd,
      kind: workspaceKind.length > 0 ? workspaceKind : 'directory',
      displayName: displayNameForPath(cwd),
      title: typeof workspaceTitle === 'string' && workspaceTitle.length > 0 ? workspaceTitle : null,
      branch: branch.length > 0 ? branch : null,
      sourceWorkspaceId: sourceWorkspaceId.length > 0 ? sourceWorkspaceId : null,
      sourceRootPath: sourceRootPath.length > 0 ? sourceRootPath : null,
      worktreePath: worktreePath.length > 0 ? worktreePath : null,
      startPoint: startPoint.length > 0 ? startPoint : null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null
    };
    workspaces.push(workspace);
    this.store.writeWorkspaceRegistry(workspaces);
    return workspace;
  }

  writeWorkspaceWithPreview(payload, action, source) {
    const workspacePath = readString(payload, 'workspacePath', readString(payload, 'cwd', readString(payload, 'path', '')));
    const workspaceTitle = readString(payload, 'workspaceTitle', readString(payload, 'title', ''));
    const workspaceId = readString(payload, 'workspaceId', '');
    const confirm = readBoolean(payload, 'confirm', false);
    const preview = readBoolean(payload, 'preview', !confirm);
    const validation = this.validateWorkspacePath(workspacePath, {
      allowMissing: false,
      allowExistingDirectory: true
    });
    const duplicate = validation.duplicateWorkspace || null;
    const duplicateOfWorkspaceId = duplicate && typeof duplicate.workspaceId === 'string' ? duplicate.workspaceId : '';
    const restoredArchived = duplicate && typeof duplicate.archivedAt === 'string' && duplicate.archivedAt.length > 0;
    let workspace = duplicate ? this.decorateWorkspace(duplicate, true) : null;
    if (validation.ok && confirm) {
      workspace = this.upsertWorkspace({
        workspacePath,
        cwd: workspacePath,
        workspaceId: workspaceId.length > 0 ? workspaceId : (restoredArchived ? duplicateOfWorkspaceId : ''),
        workspaceTitle,
        title: workspaceTitle,
        kind: this.inferWorkspaceKind(validation.resolvedPath),
        branch: readString(payload, 'branch', ''),
        dedupeByCwd: readBoolean(payload, 'dedupeByCwd', true)
      });
      if (workspace) {
        workspace.source = source;
        workspace.lastValidatedAt = nowIso();
        workspace.validation = validation;
        this.updateWorkspaceMetadata(workspace.workspaceId, {
          source,
          lastValidatedAt: workspace.lastValidatedAt,
          validation,
          lastOpenStatus: ''
        });
        workspace = this.decorateWorkspace(workspace, true);
      }
    }
    const result = this.buildRegistryActionResult(action, payload, {
      ok: validation.ok,
      preview,
      confirmed: confirm,
      workspace,
      workspacePath: validation.resolvedPath,
      cwd: validation.resolvedPath,
      kind: workspace ? workspace.kind : this.inferWorkspaceKind(validation.resolvedPath),
      status: workspace ? workspace.status : (validation.ok ? 'active' : 'stale'),
      validation,
      duplicateOfWorkspaceId,
      restoredArchived,
      message: validation.ok ? (confirm ? 'Workspace registry updated.' : 'Workspace registry preview is ready.') : validation.message,
      remediation: validation.remediation
    });
    return result;
  }

  archiveWorkspace(payload) {
    const workspaceId = readString(payload, 'workspaceId', '');
    const workspacePath = normalizePath(readString(payload, 'workspacePath', readString(payload, 'cwd', readString(payload, 'path', ''))));
    const now = new Date().toISOString();
    const workspaces = this.store.readWorkspaceRegistry();
    let archived = null;
    for (const workspace of workspaces) {
      if (!workspace) {
        continue;
      }
      const sameId = workspaceId.length > 0 && workspace.workspaceId === workspaceId;
      const samePath = workspacePath.length > 0 && normalizePath(workspace.cwd) === workspacePath;
      if (sameId || samePath) {
        workspace.archivedAt = now;
        workspace.updatedAt = now;
        archived = workspace;
        break;
      }
    }
    if (!archived) {
      return null;
    }
    this.store.writeWorkspaceRegistry(workspaces);
    this.archiveProjectIfEmpty(archived.projectId, workspaces, now);
    return archived;
  }

  archiveWorkspaceWithPreview(payload) {
    const confirm = readBoolean(payload, 'confirm', false);
    const preview = readBoolean(payload, 'preview', !confirm);
    const target = this.findWorkspaceFromPayload(payload);
    if (!target) {
      return this.buildRegistryActionResult('workspace.registry.archive', payload, {
        ok: false,
        preview,
        confirmed: confirm,
        workspace: null,
        validation: emptyValidation('workspace_not_found', 'Workspace not found.', 'Choose a workspace from the registry list.'),
        message: 'Workspace not found.',
        remediation: 'Choose a workspace from the registry list.'
      });
    }
    const validation = okValidation('Workspace can be archived.', ['Archive only marks the registry record; it does not delete local files.']);
    let workspace = this.decorateWorkspace(target, true);
    if (confirm) {
      const archived = this.archiveWorkspace({
        workspaceId: target.workspaceId,
        cwd: target.cwd
      });
      workspace = archived ? this.decorateWorkspace(archived, true) : workspace;
    }
    return this.buildRegistryActionResult('workspace.registry.archive', payload, {
      ok: true,
      preview,
      confirmed: confirm,
      workspace,
      workspacePath: workspace.cwd,
      cwd: workspace.cwd,
      kind: workspace.kind,
      status: confirm ? 'archived' : workspace.status,
      validation,
      message: confirm ? 'Workspace archived in registry.' : 'Workspace archive preview is ready.',
      remediation: ''
    });
  }

  archiveProjectIfEmpty(projectId, workspaces, archivedAt) {
    if (typeof projectId !== 'string' || projectId.length === 0) {
      return;
    }
    for (const workspace of workspaces) {
      if (workspace && workspace.projectId === projectId && (workspace.archivedAt === null || workspace.archivedAt === undefined || workspace.archivedAt === '')) {
        return;
      }
    }
    const projects = this.listProjects();
    for (const project of projects) {
      if (project && project.projectId === projectId) {
        project.archivedAt = archivedAt;
        project.updatedAt = archivedAt;
      }
    }
    this.store.writeProjectRegistry(projects);
  }

  openWorkspace(payload, opener) {
    const confirm = readBoolean(payload, 'confirm', false);
    const dryRun = readBoolean(payload, 'dryRun', !confirm);
    const preview = readBoolean(payload, 'preview', dryRun || !confirm);
    const target = this.findWorkspaceFromPayload(payload);
    const explicitPath = readString(payload, 'workspacePath', readString(payload, 'cwd', readString(payload, 'path', '')));
    const workspacePath = target ? readString(target, 'cwd', '') : normalizePath(explicitPath);
    if (workspacePath.length === 0) {
      return this.buildRegistryActionResult('workspace.registry.open', payload, {
        ok: false,
        preview,
        confirmed: confirm,
        validation: emptyValidation('workspace_open_invalid', 'Workspace id or path is required.', 'Provide a workspace id or an absolute local path.'),
        openStatus: 'invalid',
        openError: 'Workspace id or path is required.',
        message: 'Workspace id or path is required.',
        remediation: 'Provide a workspace id or an absolute local path.'
      });
    }
    const validation = this.validateWorkspacePath(workspacePath, {
      allowMissing: false,
      allowExistingDirectory: true,
      ignoreDuplicateWorkspaceId: target && typeof target.workspaceId === 'string' ? target.workspaceId : ''
    });
    const launcher = opener && typeof opener.commandForPath === 'function'
      ? opener.commandForPath(validation.resolvedPath)
      : null;
    let openStatus = validation.ok ? 'preview' : 'failed';
    let openError = validation.ok ? '' : validation.message;
    if (validation.ok && confirm && opener && typeof opener.openPath === 'function') {
      try {
        opener.openPath(validation.resolvedPath);
        openStatus = 'opened';
      } catch (error) {
        openStatus = 'failed';
        openError = error instanceof Error ? error.message : String(error);
      }
    } else if (validation.ok && confirm && !opener) {
      openStatus = 'launcher_unavailable';
      openError = 'Workspace opener is not configured.';
    }
    let workspace = target ? this.decorateWorkspace(target, true) : null;
    if (workspace && confirm && openStatus === 'opened') {
      this.updateWorkspaceMetadata(workspace.workspaceId, {
        lastOpenedAt: nowIso(),
        lastOpenStatus: openStatus,
        openError: ''
      });
      workspace = this.decorateWorkspace(this.findWorkspaceById(workspace.workspaceId), true);
    }
    return this.buildRegistryActionResult('workspace.registry.open', payload, {
      ok: validation.ok && openStatus !== 'failed' && openStatus !== 'launcher_unavailable',
      preview,
      confirmed: confirm,
      workspace,
      workspacePath: validation.resolvedPath,
      cwd: validation.resolvedPath,
      kind: workspace ? workspace.kind : this.inferWorkspaceKind(validation.resolvedPath),
      status: workspace ? workspace.status : (validation.ok ? 'active' : 'stale'),
      validation,
      openStatus,
      openCommand: launcher ? launcher.command : '',
      openArgs: launcher ? launcher.args : [],
      openError,
      message: openError.length > 0 ? openError : (confirm ? 'Workspace open requested.' : 'Workspace open preview is ready.'),
      remediation: validation.remediation
    });
  }

  listDirectorySuggestions(payload) {
    const limit = Math.max(1, Math.min(50, Math.floor(readNumber(payload, 'limit', 12))));
    const candidates = [];
    this.addDirectorySuggestion(candidates, process.cwd(), 'current');
    this.addDirectorySuggestion(candidates, os.homedir(), 'home');
    this.addDirectorySuggestion(candidates, path.join(os.homedir(), 'Desktop'), 'home');
    this.addDirectorySuggestion(candidates, path.join(os.homedir(), 'Documents'), 'home');
    for (const workspace of this.store.readWorkspaceRegistry()) {
      if (!workspace || typeof workspace.cwd !== 'string' || workspace.cwd.length === 0) {
        continue;
      }
      this.addDirectorySuggestion(candidates, workspace.cwd, 'workspace');
      this.addDirectorySuggestion(candidates, path.dirname(workspace.cwd), 'workspace-parent');
    }
    return candidates.slice(0, limit);
  }

  suggestionsResult(payload) {
    return {
      ok: true,
      action: 'workspace.registry.suggestions',
      preview: false,
      confirmed: true,
      suggestions: this.listDirectorySuggestions(payload),
      updatedAt: Date.now()
    };
  }

  addDirectorySuggestion(candidates, directoryPath, source) {
    const cwd = normalizePath(directoryPath);
    if (cwd.length === 0) {
      return;
    }
    for (const item of candidates) {
      if (item.path === cwd) {
        return;
      }
    }
    try {
      const stat = fs.statSync(cwd);
      if (!stat.isDirectory()) {
        return;
      }
    } catch (_error) {
      return;
    }
    candidates.push({
      path: cwd,
      displayName: displayNameForPath(cwd),
      source,
      exists: true
    });
  }

  doctor(payload) {
    const includeArchived = readBoolean(payload, 'includeArchived', true);
    const workspaces = this.listWorkspaces({
      includeArchived,
      validate: true
    });
    const checks = [];
    const seen = new Map();
    for (const workspace of workspaces) {
      const normalized = normalizePath(readString(workspace, 'cwd', ''));
      if (normalized.length > 0) {
        if (seen.has(normalized)) {
          checks.push({
            id: 'duplicate:' + workspace.workspaceId,
            status: 'warning',
            message: 'Duplicate workspace path: ' + normalized,
            remediation: 'Archive or merge duplicate workspace records.'
          });
        } else {
          seen.set(normalized, workspace.workspaceId);
        }
      }
      if (workspace.status === 'missing') {
        checks.push({
          id: 'missing:' + workspace.workspaceId,
          status: 'error',
          message: 'Workspace path is missing: ' + workspace.cwd,
          remediation: 'Restore the directory or archive this workspace record.'
        });
      } else if (workspace.status === 'stale') {
        checks.push({
          id: 'stale:' + workspace.workspaceId,
          status: 'warning',
          message: 'Workspace path needs attention: ' + workspace.cwd,
          remediation: workspace.validation && workspace.validation.remediation ? workspace.validation.remediation : 'Validate or update the workspace path.'
        });
      }
    }
    const projects = this.decorateProjects(this.store.readProjectRegistry(), workspaces);
    for (const project of projects) {
      if (project.activeWorkspaces === 0 && project.archivedWorkspaces === 0) {
        checks.push({
          id: 'project_empty:' + project.projectId,
          status: 'warning',
          message: 'Project has no workspace records: ' + project.displayName,
          remediation: 'Import or create a workspace for this project, or archive the stale project record.'
        });
      }
    }
    if (checks.length === 0) {
      checks.push({
        id: 'registry_ok',
        status: 'ok',
        message: 'Workspace registry is consistent.',
        remediation: ''
      });
    }
    let errors = 0;
    let warnings = 0;
    for (const check of checks) {
      if (check.status === 'error') {
        errors += 1;
      } else if (check.status === 'warning') {
        warnings += 1;
      }
    }
    return {
      ok: errors === 0,
      action: 'workspace.registry.doctor',
      checks,
      errors,
      warnings,
      generatedAt: nowIso()
    };
  }

  buildRegistryActionResult(action, payload, details) {
    const includeArchived = readBoolean(payload, 'includeArchived', true);
    const workspaces = this.listWorkspaces({
      includeArchived,
      validate: true
    });
    const allWorkspaces = includeArchived ? workspaces : this.listWorkspaces({
      includeArchived: true,
      validate: true
    });
    const workspace = details.workspace || null;
    return {
      ok: details.ok === true,
      action,
      preview: details.preview === true,
      confirmed: details.confirmed === true,
      validation: details.validation || okValidation('OK.'),
      projects: this.decorateProjects(this.store.readProjectRegistry(), allWorkspaces),
      workspaces,
      suggestions: this.listDirectorySuggestions(payload),
      workspace,
      workspaceId: workspace && typeof workspace.workspaceId === 'string' ? workspace.workspaceId : '',
      projectId: workspace && typeof workspace.projectId === 'string' ? workspace.projectId : '',
      cwd: details.cwd || (workspace && typeof workspace.cwd === 'string' ? workspace.cwd : ''),
      workspacePath: details.workspacePath || (workspace && typeof workspace.cwd === 'string' ? workspace.cwd : ''),
      kind: details.kind || (workspace && typeof workspace.kind === 'string' ? workspace.kind : ''),
      status: details.status || (workspace && typeof workspace.status === 'string' ? workspace.status : ''),
      duplicateOfWorkspaceId: details.duplicateOfWorkspaceId || '',
      restoredArchived: details.restoredArchived === true,
      openStatus: details.openStatus || '',
      openCommand: details.openCommand || '',
      openArgs: Array.isArray(details.openArgs) ? details.openArgs : [],
      openError: details.openError || '',
      message: details.message || '',
      remediation: details.remediation || '',
      updatedAt: Date.now()
    };
  }

  decorateProjects(projects, workspaces) {
    const decorated = [];
    const workspaceItems = Array.isArray(workspaces) ? workspaces : [];
    for (const project of Array.isArray(projects) ? projects : []) {
      if (!project) {
        continue;
      }
      let activeWorkspaces = 0;
      let archivedWorkspaces = 0;
      let missingWorkspaces = 0;
      let staleWorkspaces = 0;
      for (const workspace of workspaceItems) {
        if (!workspace || workspace.projectId !== project.projectId) {
          continue;
        }
        if (workspace.status === 'archived') {
          archivedWorkspaces += 1;
        } else if (workspace.status === 'missing') {
          missingWorkspaces += 1;
        } else if (workspace.status === 'stale') {
          staleWorkspaces += 1;
        } else {
          activeWorkspaces += 1;
        }
      }
      decorated.push(Object.assign({}, project, {
        status: typeof project.archivedAt === 'string' && project.archivedAt.length > 0 ? 'archived' : 'active',
        activeWorkspaces,
        archivedWorkspaces,
        missingWorkspaces,
        staleWorkspaces,
        workspaceCount: activeWorkspaces + archivedWorkspaces + missingWorkspaces + staleWorkspaces
      }));
    }
    return decorated;
  }

  decorateWorkspace(workspace, validate) {
    if (!workspace || typeof workspace !== 'object') {
      return workspace;
    }
    const cwd = normalizePath(readString(workspace, 'cwd', readString(workspace, 'workspacePath', '')));
    const validation = validate ? this.validateWorkspacePath(cwd, {
      allowMissing: false,
      allowExistingDirectory: true,
      ignoreDuplicateWorkspaceId: readString(workspace, 'workspaceId', '')
    }) : okValidation('Validation skipped.');
    const title = readString(workspace, 'title', '');
    const displayName = readString(workspace, 'displayName', displayNameForPath(cwd));
    return Object.assign({}, workspace, {
      cwd,
      workspacePath: cwd,
      displayName: displayName.length > 0 ? displayName : displayNameForPath(cwd),
      title: title.length > 0 ? title : null,
      kind: readString(workspace, 'kind', this.inferWorkspaceKind(cwd)),
      source: readString(workspace, 'source', readString(workspace, 'kind', 'directory')),
      status: workspaceStatusFor(workspace, validation),
      missing: validation.code === 'path_missing',
      stale: validation.ok !== true && validation.code !== 'path_missing',
      lastValidatedAt: readString(workspace, 'lastValidatedAt', ''),
      lastOpenedAt: readString(workspace, 'lastOpenedAt', ''),
      lastOpenStatus: readString(workspace, 'lastOpenStatus', ''),
      openError: readString(workspace, 'openError', ''),
      validation
    });
  }

  validateWorkspacePath(workspacePath, options) {
    const allowMissing = options && options.allowMissing === true;
    const ignoreDuplicateWorkspaceId = options && typeof options.ignoreDuplicateWorkspaceId === 'string' ? options.ignoreDuplicateWorkspaceId : '';
    const rawPath = typeof workspacePath === 'string' ? workspacePath.trim() : '';
    if (rawPath.length === 0) {
      return Object.assign(emptyValidation('path_required', 'Workspace path is required.', 'Provide an absolute local directory path.'), {
        resolvedPath: ''
      });
    }
    if (!path.isAbsolute(rawPath)) {
      return Object.assign(emptyValidation('path_not_absolute', 'Workspace path must be absolute.', 'Use a full local directory path.'), {
        resolvedPath: normalizePath(rawPath)
      });
    }
    const resolvedPath = normalizePath(rawPath);
    let stat = null;
    try {
      stat = fs.statSync(resolvedPath);
    } catch (error) {
      if (!allowMissing) {
        return Object.assign(emptyValidation('path_missing', 'Workspace path does not exist.', 'Restore the directory or choose another workspace path.'), {
          resolvedPath
        });
      }
    }
    if (stat && !stat.isDirectory()) {
      return Object.assign(emptyValidation('path_not_directory', 'Workspace path is not a directory.', 'Choose a local directory.'), {
        resolvedPath
      });
    }
    if (stat) {
      try {
        fs.accessSync(resolvedPath, fs.constants.R_OK);
      } catch (_error) {
        return Object.assign(emptyValidation('path_not_readable', 'Workspace path is not readable.', 'Check filesystem permissions.'), {
          resolvedPath
        });
      }
    }
    const duplicate = this.findWorkspaceByPath(resolvedPath);
    if (duplicate && readString(duplicate, 'workspaceId', '') !== ignoreDuplicateWorkspaceId) {
      const validation = okValidation('Workspace path already exists in registry.', ['Existing workspace record will be updated instead of duplicated.']);
      validation.code = 'duplicate_cwd';
      validation.duplicateWorkspace = duplicate;
      validation.resolvedPath = resolvedPath;
      return validation;
    }
    const validation = okValidation('Workspace path is valid.');
    validation.resolvedPath = resolvedPath;
    validation.gitDetected = fs.existsSync(path.join(resolvedPath, '.git'));
    return validation;
  }

  inferWorkspaceKind(workspacePath) {
    const cwd = normalizePath(workspacePath);
    if (cwd.length > 0 && fs.existsSync(path.join(cwd, '.git'))) {
      return 'git';
    }
    return 'directory';
  }

  findWorkspaceFromPayload(payload) {
    const workspaceId = readString(payload, 'workspaceId', readString(payload, 'id', ''));
    const workspacePath = normalizePath(readString(payload, 'workspacePath', readString(payload, 'cwd', readString(payload, 'path', ''))));
    if (workspaceId.length > 0) {
      return this.findWorkspaceById(workspaceId);
    }
    if (workspacePath.length > 0) {
      return this.findWorkspaceByPath(workspacePath);
    }
    return null;
  }

  findWorkspaceById(workspaceId) {
    if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
      return null;
    }
    for (const workspace of this.store.readWorkspaceRegistry()) {
      if (workspace && workspace.workspaceId === workspaceId) {
        return workspace;
      }
    }
    return null;
  }

  findWorkspaceByPath(workspacePath) {
    const cwd = normalizePath(workspacePath);
    if (cwd.length === 0) {
      return null;
    }
    for (const workspace of this.store.readWorkspaceRegistry()) {
      if (!workspace || typeof workspace.cwd !== 'string') {
        continue;
      }
      if (normalizePath(workspace.cwd) === cwd) {
        return workspace;
      }
    }
    return null;
  }

  updateWorkspaceMetadata(workspaceId, metadata) {
    if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
      return null;
    }
    const workspaces = this.store.readWorkspaceRegistry();
    let updated = null;
    for (const workspace of workspaces) {
      if (workspace && workspace.workspaceId === workspaceId) {
        for (const key of Object.keys(metadata || {})) {
          workspace[key] = metadata[key];
        }
        workspace.updatedAt = nowIso();
        updated = workspace;
        break;
      }
    }
    if (updated) {
      this.store.writeWorkspaceRegistry(workspaces);
    }
    return updated;
  }
}

module.exports = {
  WorkspaceRegistry
};
