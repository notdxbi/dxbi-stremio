import TemplateCache from '../../utils/templateCache';
import PluginSettingSchema from '../../interfaces/PluginSettingSchema';
import { FILE_EXTENSIONS } from '../../constants';

export const pluginOptionsModal = {
    
    getTemplate: (
        pluginName: string, 
        schema: PluginSettingSchema[], 
        currentValues: Record<string, any>
    ): string => {
        let template = TemplateCache.load(__dirname, 'plugin-settings-modal');
        const modalId = `${pluginName.replace(/[^a-zA-Z0-9]/g, '')}-settings-modal`;

        // Options listed under their group's heading (in the order the groups first appear), each
        // marked with the words a search matches
        const groups = new Map<string, string>();
        schema.forEach(setting => {
            const currentValue = currentValues[setting.key] ?? '';
            let html = '';

            if (setting.type === 'toggle') {
                html = pluginOptionsModal._buildToggle(setting, currentValue);
            } else if (setting.type === 'input') {
                html = pluginOptionsModal._buildInput(setting, currentValue);
            } else if (setting.type === 'select') {
                html = pluginOptionsModal._buildSelect(setting, currentValue);
            }
            const words = [setting.label, setting.description, setting.group, ...(setting.options || []).map(o => o.label)].join(' ').toLowerCase();
            html = html.replace('class="option-vFOAS"', `class="option-vFOAS dxs-option" data-search="${escapeAttr(words)}"`);
            const group = setting.group || '';
            groups.set(group, (groups.get(group) || '') + html);
        });

        const grouped = groups.size > 1 || !groups.has('');
        let settingsHtml = '';
        let navHtml = '';
        [...groups].forEach(([group, html], i) => {
            if (!grouped) { settingsHtml += html; return; }
            const name = escapeAttr(group || 'More');
            settingsHtml += `<section class="dxs-group" data-group="${i}"><h3 class="dxs-group-title">${name}</h3>${html}</section>`;
            navHtml += `<button type="button" data-group="${i}"${i === 0 ? ' class="is-active"' : ''}>${name}</button>`;
        });

        return template
            .replace(/\{\{\s*modalId\s*\}\}/g, modalId)
            .replace(/\{\{\s*groupedClass\s*\}\}/g, grouped ? ' is-grouped' : '')
            .replace(/\{\{\s*pluginName\s*\}\}/g, displayName(pluginName))
            .replace(/\{\{\s*navHtml\s*\}\}/g, () => navHtml)
            .replace(/\{\{\s*settingsHtml\s*\}\}/g, () => settingsHtml);
    },

    // The search box and the list of groups: typing hides what doesn't match (every word must be
    // found), a group's name jumps to it, and the group in view is marked as you scroll
    wire: (modal: HTMLElement): void => {
        const search = modal.querySelector<HTMLInputElement>('.dxs-search');
        const list = modal.querySelector<HTMLElement>('.dxs-list');
        const navButtons = [...modal.querySelectorAll<HTMLButtonElement>('.dxs-nav button')];
        const sections = [...modal.querySelectorAll<HTMLElement>('.dxs-group')];
        if (!search || !list) return;

        const mark = (group: string | undefined) => navButtons.forEach(b => b.classList.toggle('is-active', b.dataset.group === group));

        search.addEventListener('input', () => {
            const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
            let shown = 0;
            modal.querySelectorAll<HTMLElement>('.dxs-option').forEach(option => {
                const hit = words.every(w => (option.dataset.search || '').includes(w));
                option.classList.toggle('is-hidden', !hit);
                if (hit) shown++;
            });
            sections.forEach(section => {
                const empty = !section.querySelector('.dxs-option:not(.is-hidden)');
                section.classList.toggle('is-empty', empty);
                navButtons.find(b => b.dataset.group === section.dataset.group)?.classList.toggle('is-empty', empty);
            });
            modal.classList.toggle('is-nothing', shown === 0);
            list.scrollTop = 0;
            mark(sections.find(section => !section.classList.contains('is-empty'))?.dataset.group);
        });
        // Escape clears the search first, rather than closing the settings
        search.addEventListener('keydown', e => {
            if (e.key === 'Escape' && search.value) {
                e.stopPropagation();
                search.value = '';
                search.dispatchEvent(new Event('input'));
            }
        });

        navButtons.forEach(button => button.addEventListener('click', () => {
            const section = sections.find(s => s.dataset.group === button.dataset.group);
            if (!section) return;
            list.scrollTo({ top: section.offsetTop - list.offsetTop, behavior: 'smooth' });
            mark(button.dataset.group);
        }));

        list.addEventListener('scroll', () => {
            const top = list.scrollTop + list.offsetTop + 40;
            const current = sections.filter(s => !s.classList.contains('is-empty') && s.offsetTop <= top).pop() || sections[0];
            if (current) mark(current.dataset.group);
        }, { passive: true });

        search.focus();
    },

    _buildToggle: (setting: PluginSettingSchema, currentValue: any): string => {
        const isChecked = currentValue === true || currentValue === "true";
        const checkedClass = isChecked ? 'checked' : '';

        return `
        <div class="option-vFOAS" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <div class="heading-dYMDt" style="flex: 1; padding-right: 20px; min-width: 0;">
                <div class="label-qI6Vh" style="font-size: 1.1em; white-space: normal; overflow: visible; text-overflow: clip; line-height: 1.4;">${setting.label}</div>
                ${setting.description ? `<div style="font-size: 0.85em; color: #a0a0a0; margin-top: 4px; white-space: normal; line-height: 1.4;">${setting.description}</div>` : ''}
            </div>
            <div class="content-P2T0i" style="flex-shrink: 0;">
                <div tabindex="0" class="toggle-container-lZfHP button-container-zVLH6 plugin-setting-toggle ${checkedClass}" data-key="${setting.key}" style="outline: none;">
                    <div class="toggle-toOWM"></div>
                </div>
            </div>
        </div>`;
    },

    _buildInput: (setting: PluginSettingSchema, currentValue: any): string => {
            return `
            <div class="option-vFOAS" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div class="heading-dYMDt" style="flex: 1; padding-right: 20px; min-width: 0;">
                    <div class="label-qI6Vh" style="font-size: 1.1em; white-space: normal; overflow: visible; text-overflow: clip; line-height: 1.4;">${setting.label}</div>
                    ${setting.description ? `<div style="font-size: 0.85em; color: #a0a0a0; margin-top: 4px; white-space: normal; line-height: 1.4;">${setting.description}</div>` : ''}
                </div>
                
                <div class="content-P2T0i" style="flex-shrink: 0; width: 50%; max-width: 300px;">
                    <label class="search-bar-k7MXd search-bar-container-p4tSt" style="width: 100%; padding: 0; margin: 0; display: block;">
                        <input data-key="${setting.key}" size="1" autocorrect="off" autocapitalize="off" autocomplete="off" spellcheck="false" tabindex="0" class="search-input-bAgAh text-input-hnLiz plugin-setting-input" type="text" placeholder="${setting.label}" value="${escapeAttr(String(currentValue))}" style="width: 100%; box-sizing: border-box; height: 42px; padding: 0 15px;">
                    </label>
                </div>
            </div>`;
    },

    _buildSelect: (setting: PluginSettingSchema, currentValue: any): string => {
        let optionsHtml = '';
        if (setting.options) {
            setting.options.forEach((opt: { label: string; value: any }) => {
                const selected = (opt.value === currentValue) ? 'selected' : '';
                optionsHtml += `<option value="${opt.value}" ${selected} style="background-color: #1a1a1a; color: white;">${opt.label}</option>`;
            });
        }

        return `
        <div class="option-vFOAS" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <div class="heading-dYMDt" style="flex: 1; padding-right: 20px; min-width: 0;">
                <div class="label-qI6Vh" style="font-size: 1.1em; white-space: normal; overflow: visible; text-overflow: clip; line-height: 1.4;">${setting.label}</div>
                ${setting.description ? `<div style="font-size: 0.85em; color: #a0a0a0; margin-top: 4px; white-space: normal; line-height: 1.4;">${setting.description}</div>` : ''}
            </div>
            
            <div class="content-P2T0i" style="flex-shrink: 0; width: 50%; max-width: 300px;">
                <select data-key="${setting.key}" class="search-input-bAgAh text-input-hnLiz plugin-setting-select" style="width: 100%; padding: 0 15px; cursor: pointer; background-color: rgba(255, 255, 255, 0.08); color: white; border: 1px solid transparent; border-radius: 20px; outline: none; appearance: auto; box-sizing: border-box; height: 42px;">
                    ${optionsHtml}
                </select>
            </div>
        </div>`;
    }
};

function escapeAttr(text: string): string {
    return text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

// The plugin's file name, or its proper name for dx.bi's own
function displayName(pluginName: string): string {
    const base = pluginName.replace(FILE_EXTENSIONS.PLUGIN, "");
    return base === "dxbi" ? "dx.bi" : base;
}
