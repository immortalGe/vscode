/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {localize} from 'vs/nls';
import {Action} from 'vs/base/common/actions';
import {join} from 'vs/base/common/paths';
import {IJSONSchema} from 'vs/base/common/jsonSchema';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {IExtensionPointUser, ExtensionsRegistry} from 'vs/platform/extensions/common/extensionsRegistry';

export interface ResourceFilter {
	language?: string;
	scheme?: string;
	pattern?: string;
}

export type Locations = 'editor/primary' | 'editor/secondary' | 'explorer/context';

export interface ThemableIcon {
	dark: string;
	light: string;
}

export interface Command {
	command: string;
	title: string;
	category?: string;
	where?: Locations | Locations[];
	when?: string | string[] | ResourceFilter | ResourceFilter[];
	icon?: string | ThemableIcon;
}

export function isThemableIcon(thing: any): thing is ThemableIcon {
	return typeof thing === 'object' && thing && typeof (<ThemableIcon>thing).dark === 'string' && typeof (<ThemableIcon>thing).light === 'string';
}


namespace validation {

	function isValidWhere(where: Locations | Locations[], user: IExtensionPointUser<any>): boolean {
		if (Array.isArray<Locations>(where)) {
			return where.every(where => isValidWhere(where, user));
		} else if (['editor/primary', 'editor/secondary', 'explorer/context'].indexOf(where) < 0) {
			user.collector.error(localize('optwhere', "property `where` can be omitted or must be a valid enum value"));
			return false;
		}
		return true;
	}

	function isValidWhen(when: string | string[] | ResourceFilter | ResourceFilter[], user: IExtensionPointUser<any>): boolean {
		if (Array.isArray<string | ResourceFilter>(when)) {
			for (let w of when) {
				if (!isValidWhen(w, user)) {
					return false;
				}
			}
		} else if (typeof when === 'string' || typeof when === 'object') {
			return true;
		}
		user.collector.error(localize('requirefilter', "property `when` is mandatory and must be a string or like `{language, scheme, pattern}`"));
		return false;
	}

	function isValidIcon(icon: string | ThemableIcon, user: IExtensionPointUser<any>): boolean {
		if (typeof icon === 'undefined') {
			return true;
		}
		if (typeof icon === 'string') {
			return true;
		}
		if (typeof icon === 'object' && typeof (<ThemableIcon>icon).dark === 'string' && typeof (<ThemableIcon>icon).light === 'string') {
			return true;
		}
		user.collector.error(localize('opticon', "property `icon` can be omitted or must be either a string or a literal like `{dark, light}`"));
		return false;
	}

	export function isValidCommand(candidate: Command, user: IExtensionPointUser<any>): boolean {
		if (!candidate) {
			user.collector.error(localize('nonempty', "expected non-empty value."));
			return false;
		}
		if (typeof candidate.command !== 'string') {
			user.collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'command'));
			return false;
		}
		if (typeof candidate.title !== 'string') {
			user.collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'title'));
			return false;
		}
		if (candidate.category && typeof candidate.category !== 'string') {
			user.collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'category'));
			return false;
		}
		if (!isValidIcon(candidate.icon, user)) {
			return false;
		}

		// make icon paths absolute
		let {icon} = candidate;
		if (typeof icon === 'string') {
			candidate.icon = join(user.description.extensionFolderPath, icon);
		} else if(isThemableIcon(icon)) {
			icon.dark = join(user.description.extensionFolderPath, icon.dark);
			icon.light = join(user.description.extensionFolderPath, icon.light);
		}

		return true;
	}

}


namespace schema {

	const filterType: IJSONSchema = {
		type: 'object',
		properties: {
			language: {
				description: localize('vscode.extension.contributes.filterType.language', ""),
				type: 'string'
			},
			scheme: {
				description: localize('vscode.extension.contributes.filterType.scheme', ""),
				type: 'string'
			},
			pattern: {
				description: localize('vscode.extension.contributes.filterType.pattern', ""),
				type: 'string'
			}
		}
	};

	const contextType: IJSONSchema = {
		type: 'object',
		properties: {
			where: {
				description: localize('vscode.extension.contributes.commandType.context.where', "Menus and tool bars to which commands can be added, e.g. `editor title actions` or `explorer context menu`"),
				enum: [
					'editor/primary',
					'editor/secondary'
				]
			},
			when: {
				description: localize('vscode.extension.contributes.commandType.context.when', "Condition that must be met in order to show the command. Can be a language identifier, a glob-pattern, an uri scheme, or a combination of them."),
				anyOf: [
					'string',
					filterType,
					{ type: 'array', items: 'string' },
					{ type: 'array', items: filterType },
				]
			},
			icon: {
				description: localize('vscode.extension.contributes.commandType.icon', '(Optional) Icon which is used to represent the command in the UI. Either a file path or a themable configuration'),
				oneOf: [
					'string',
					{
						type: 'object',
						properties: {
							light: {
								description: localize('vscode.extension.contributes.commandType.icon.light', 'Icon path when a light theme is used'),
								type: 'string'
							},
							dark: {
								description: localize('vscode.extension.contributes.commandType.icon.dark', 'Icon path when a dark theme is used'),
								type: 'string'
							}
						}
					}
				]
			}
		}
	};

	const commandType: IJSONSchema = {
		type: 'object',
		properties: {
			command: {
				description: localize('vscode.extension.contributes.commandType.command', 'Identifier of the command to execute'),
				type: 'string'
			},
			title: {
				description: localize('vscode.extension.contributes.commandType.title', 'Title by which the command is represented in the UI'),
				type: 'string'
			},
			category: {
				description: localize('vscode.extension.contributes.commandType.category', '(Optional) Category string by the command is grouped in the UI'),
				type: 'string'
			},
			context: {
				description: localize('vscode.extension.contributes.commandType.context', '(Optional) Define places where the command should show in addition to the Command palette'),
				oneOf: [
					contextType,
					{ type: 'array', items: contextType }
				]
			}
		}
	};

	export const commandContribution: IJSONSchema = {
		description: localize('vscode.extension.contributes.commands', "Contributes commands to the command palette."),
		oneOf: [
			commandType,
			{
				type: 'array',
				items: commandType
			}
		]
	};
}

export const commands: Command[] = [];

function handleCommand(command: Command, user: IExtensionPointUser<any>): void {
	if (validation.isValidCommand(command, user)) {
		// store command globally
		commands.push(command);
	}
}

ExtensionsRegistry.registerExtensionPoint<Command | Command[]>('commands', schema.commandContribution).setHandler(extensions => {
	for (let extension of extensions) {
		const {value} = extension;
		if (Array.isArray<Command>(value)) {
			for (let command of value) {
				handleCommand(command, extension);
			}
		} else {
			handleCommand(value, extension);
		}
	}

	Object.freeze(commands);
});

export class CommandAction extends Action {

	constructor(
		public command: Command,
		@IExtensionService extensionService: IExtensionService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(command.command, command.title);
		this.order = Number.MAX_VALUE;

		const activationEvent = `onCommand:${command.command}`;
		this._actionCallback = (...args: any[]) => {
			return extensionService.activateByEvent(activationEvent).then(() => {
				return keybindingService.executeCommand(command.command, ...args);
			});
		};
	}
}