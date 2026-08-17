import json
import os
import sys
import argparse

def get_target_path(module_name, lang_code):
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    module_path = os.path.join(base_dir, module_name)
    if not os.path.exists(module_path):
        print(f"Warning: Module {module_name} does not exist at {module_path}. Falling back to 'entry'.")
        module_path = os.path.join(base_dir, 'entry')
    
    res_path = os.path.join(module_path, 'src', 'main', 'resources', lang_code, 'element', 'string.json')
    return res_path

def update_json(path, items, lang_key, replace_existing):
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        data = {"string": []}
    else:
        with open(path, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                print(f"Error: Could not decode JSON at {path}. Initializing new.")
                data = {"string": []}
            
    existing_items = {item['name']: item for item in data.get('string', [])}
    added_count = 0
    updated_count = 0
    for item in items:
        value = item.get(lang_key)
        if value is None:
            continue
        existing_item = existing_items.get(item['name'])
        if existing_item is None:
            next_item = {"name": item['name'], "value": value}
            data.setdefault('string', []).append(next_item)
            existing_items[item['name']] = next_item
            added_count += 1
        elif replace_existing and existing_item.get('value') != value:
            existing_item['value'] = value
            updated_count += 1
            
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return added_count, updated_count

def load_items(json_data, file_path):
    if file_path:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return json.loads(json_data)

def validate_items(items):
    if not isinstance(items, list):
        raise ValueError('Input data must be a JSON array.')
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise ValueError(f'Item {index} must be a JSON object.')
        name = item.get('name')
        if not isinstance(name, str) or not name.strip():
            raise ValueError(f'Item {index} must contain a non-empty name.')
        zh_value = item.get('zh')
        if zh_value is not None and not isinstance(zh_value, str):
            raise ValueError(f'Chinese value for {name} must be a string.')
        if isinstance(zh_value, str) and '?' in zh_value:
            raise ValueError(
                f'Chinese value for {name} contains ASCII question marks. '
                'Use UTF-8 input and the Chinese full-width question mark when punctuation is intended.'
            )

def main():
    parser = argparse.ArgumentParser(description='Update i18n string.json files for HarmonyOS projects.')
    parser.add_argument('json_data', nargs='?', type=str, help='A JSON array string containing i18n items')
    parser.add_argument('--file', type=str, help='Read the JSON array from a UTF-8 file')
    parser.add_argument('--replace-existing', action='store_true', help='Replace values for existing resource keys')
    parser.add_argument('--module', type=str, default='entry', help='Target module name (default: entry)')
    args = parser.parse_args()

    try:
        if bool(args.json_data) == bool(args.file):
            raise ValueError('Provide exactly one of json_data or --file.')
        items = load_items(args.json_data, args.file)
        validate_items(items)
    except (OSError, json.JSONDecodeError, ValueError) as e:
        print(f"Error: Invalid i18n input. {e}")
        sys.exit(1)

    base_path = get_target_path(args.module, 'base')
    en_path = get_target_path(args.module, 'en_US')
    zh_path = get_target_path(args.module, 'zh_CN')

    zh_added, zh_updated = update_json(base_path, items, 'zh', args.replace_existing)
    en_added, en_updated = update_json(en_path, items, 'en', args.replace_existing)
    zh_cn_added, zh_cn_updated = update_json(zh_path, items, 'zh', args.replace_existing)

    print(f"Successfully updated i18n resources for module '{args.module}'.")
    print(f"Added {zh_added}, updated {zh_updated} keys in {base_path}")
    print(f"Added {en_added}, updated {en_updated} keys in {en_path}")
    print(f"Added {zh_cn_added}, updated {zh_cn_updated} keys in {zh_path}")

if __name__ == '__main__':
    main()
