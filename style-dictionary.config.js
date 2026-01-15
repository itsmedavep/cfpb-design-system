// style-dictionary.config.js — ESM
// Behavior summary:
// - One CSS file per token JSON under packages/cfpb-design-system/src/tokens.
// - Token names are full-path kebab case (no dropped segments).
// - Colors: prefer hex, otherwise emit lossless rgba; validate RGB inputs and error on malformed values.
// - Aliases: preserve Figma alias metadata as var(--...), warn on cross-set collisions, and error if a collision lacks set names.
// - CSS output keeps comma-separated values tight without touching comments.
import StyleDictionary from 'style-dictionary';
import fs from 'fs';
import path from 'path';
import {
  logBrokenReferenceLevels,
  logVerbosityLevels,
  logWarningLevels,
  propertyFormatNames,
} from 'style-dictionary/enums';
import { fileHeader, formattedVariables } from 'style-dictionary/utils';

const baseDir = 'packages/cfpb-design-system/src';
const tokenBase = path.resolve(baseDir, 'tokens');
const cssFormatName = 'css/variables-no-space-commas';

// ---- helpers ----
const toPosix = (fsPath) => fsPath.split(path.sep).join('/');
const toAbsPosix = (fsPath) =>
  toPosix(path.isAbsolute(fsPath) ? fsPath : path.resolve(fsPath));
const isNumber = (value) => Number.isFinite(value);
const toNumber = (value) => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return Number(value);
  }
  return Number.NaN;
};
const hexPattern = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function getAllDirs(dirPath) {
  const out = [];
  for (const dirent of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (dirent.isDirectory() && !dirent.name.startsWith('.')) {
      const full = path.join(dirPath, dirent.name);
      out.push(full, ...getAllDirs(full));
    }
  }
  return out;
}

const trimTrailingZeros = (value) => {
  const str = String(value);
  if (!str.includes('.') || str.includes('e')) {
    return str;
  }
  return str.replace(/\.?0+$/, '');
};

const formatPercent = (value) => `${trimTrailingZeros(value * 100)}%`;
// Normalize commas only inside CSS value segments (keeps comments untouched).
const normalizeCommaSpacing = (value) => {
  const lines = value.split('\n');
  const out = [];
  let inValue = false;
  let valueHasComma = false;

  for (const line of lines) {
    if (!inValue) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) {
        out.push(line);
        continue;
      }
      const semicolonIndex = line.indexOf(';', colonIndex);
      const prefix = line.slice(0, colonIndex + 1);
      if (semicolonIndex !== -1) {
        const valueSegment = line.slice(colonIndex + 1, semicolonIndex);
        if (!valueSegment.includes(',')) {
          out.push(line);
          continue;
        }
        const normalizedValue = valueSegment.replace(/\s*,\s*/g, ',');
        out.push(`${prefix}${normalizedValue}${line.slice(semicolonIndex)}`);
        continue;
      }
      const valueSegment = line.slice(colonIndex + 1);
      valueHasComma = valueSegment.includes(',');
      const normalizedValue = valueHasComma
        ? valueSegment.replace(/\s*,\s*/g, ',')
        : valueSegment;
      out.push(`${prefix}${normalizedValue}`);
      inValue = true;
      continue;
    }

    const semicolonIndex = line.indexOf(';');
    const valueSegment =
      semicolonIndex === -1 ? line : line.slice(0, semicolonIndex);
    if (valueSegment.includes(',')) {
      valueHasComma = true;
    }
    const normalizedValue = valueHasComma
      ? valueSegment.replace(/\s*,\s*/g, ',')
      : valueSegment;
    if (semicolonIndex === -1) {
      out.push(normalizedValue);
      continue;
    }
    out.push(`${normalizedValue}${line.slice(semicolonIndex)}`);
    inValue = false;
    valueHasComma = false;
  }

  return out.join('\n');
};
const toKebab = (value) =>
  String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();

const getTokenDirs = () => [tokenBase, ...getAllDirs(tokenBase)];
const getJsonFiles = (dirPath) =>
  fs.readdirSync(dirPath).filter((file) => file.endsWith('.json'));

const getFileDestination = (relDir, jsonFile) => {
  const cssFileName = `${path.basename(jsonFile, '.json')}.css`;
  return relDir === '' ? cssFileName : `${toPosix(relDir)}/${cssFileName}`;
};

const getFilterName = (relDir, jsonFile) =>
  `filter__${(relDir || '_').replace(
    /[^a-zA-Z0-9_/-]/g,
    '_',
  )}__${jsonFile.replace(/[^a-zA-Z0-9_.-]/g, '_')}`.replace(
    /[^a-zA-Z0-9_]/g,
    '_',
  );

const createFileEntry = (destination, filterName) => ({
  destination,
  format: cssFormatName,
  filter: filterName,
  options: {
    // keep references as var(--...) in the output
    outputReferences: true,
    usesDtcg: true,
    selector: ':root', // <-output to shadow dom
  },
});

const buildFilesAndFilters = (tokenDirs) => {
  const files = [];
  const filtersToRegister = []; // store to register after we know full paths

  for (const dirPath of tokenDirs) {
    const jsonFiles = getJsonFiles(dirPath);
    for (const jsonFile of jsonFiles) {
      const fullPathAbsPosix = toAbsPosix(path.join(dirPath, jsonFile));
      const relDir = path.relative(tokenBase, dirPath); // '' if at root
      const destination = getFileDestination(relDir, jsonFile);
      const filterName = getFilterName(relDir, jsonFile);

      filtersToRegister.push({ filterName, fullPathAbsPosix });
      files.push(createFileEntry(destination, filterName));
    }
  }

  return { files, filtersToRegister };
};

const isColorToken = (token) => {
  const tokenType = token?.$type ?? token?.type;
  return tokenType === 'color';
};

// Detect any RGB-like shape to decide if we should validate strictly.
const hasRgbShape = (value) => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length >= 3;
  }
  if (value.colorSpace === 'srgb' && Array.isArray(value.components)) {
    return value.components.length >= 3;
  }
  if (value.srgb || value.rgb) {
    return true;
  }
  return 'r' in value && 'g' in value && 'b' in value;
};

// Strict validation: all channels must be numeric; alpha optional.
const validateRgbValue = ({ r, g, b, a }) => {
  if (![r, g, b].every(isNumber)) {
    return false;
  }
  if (a === undefined || a === null) {
    return true;
  }
  return isNumber(a);
};

// Prefer Figma alias metadata so CSS keeps var(--alias) instead of resolved values.
const getAliasInfo = (token) => {
  const aliasData =
    token?.$extensions?.['com.figma.aliasData'] ??
    token?.extensions?.['com.figma.aliasData'];
  if (!aliasData?.targetVariableName) {
    return null;
  }
  return {
    name: aliasData.targetVariableName,
    setName: aliasData.targetVariableSetName,
  };
};

const getRawTokenValue = (token) =>
  token.original?.value ??
  token.original?.$value ??
  token.value ??
  token.$value;

const getHexValue = (value) => {
  if (typeof value === 'string' && hexPattern.test(value.trim())) {
    return value.trim();
  }
  if (value && typeof value === 'object') {
    const hex = value.hex || value.hexa;
    if (typeof hex === 'string' && hexPattern.test(hex.trim())) {
      return hex.trim();
    }
  }
  return null;
};

const getSrgbValue = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  // DTCG-style sRGB with components/alpha.
  if (value.colorSpace === 'srgb' && Array.isArray(value.components)) {
    const [r, g, b] = value.components;
    const a = value.alpha ?? value.opacity;
    return {
      r: toNumber(r),
      g: toNumber(g),
      b: toNumber(b),
      a: a === undefined || a === null ? undefined : toNumber(a),
    };
  }
  if (Array.isArray(value)) {
    const [r, g, b, a] = value;
    return {
      r: toNumber(r),
      g: toNumber(g),
      b: toNumber(b),
      a: a === undefined || a === null ? undefined : toNumber(a),
    };
  }
  if (value.srgb) {
    return getSrgbValue(value.srgb);
  }
  if (value.rgb) {
    return getSrgbValue(value.rgb);
  }
  if ('r' in value && 'g' in value && 'b' in value) {
    return {
      r: toNumber(value.r),
      g: toNumber(value.g),
      b: toNumber(value.b),
      a:
        value.a === undefined || value.a === null
          ? undefined
          : toNumber(value.a),
    };
  }
  return null;
};

// Emit lossless rgba; allow 0–255 alpha to match common manual edits.
const formatRgba = ({ r, g, b, a }) => {
  if (![r, g, b].every(isNumber)) {
    return null;
  }
  let alpha = isNumber(a) ? a : 1;
  if (alpha > 1 && alpha <= 255) {
    alpha = alpha / 255;
  }
  const usePercent = [r, g, b].every((channel) => channel >= 0 && channel <= 1);
  const channels = usePercent
    ? [formatPercent(r), formatPercent(g), formatPercent(b)]
    : [trimTrailingZeros(r), trimTrailingZeros(g), trimTrailingZeros(b)];

  return `rgba(${channels.join(',')},${trimTrailingZeros(alpha)})`;
};

const getFormattingCloneWithoutPrefix = (formatting) => {
  const clone = structuredClone(formatting) ?? {};
  delete clone.prefix;
  return clone;
};

// ---- discover all token json files and prepare per-file entries ----
const { files, filtersToRegister } = buildFilesAndFilters(getTokenDirs());

const nameKebabFullTransform = {
  type: 'name',
  transform: (token) => {
    const parts = Array.isArray(token.path) ? token.path : [];
    const basis = parts.length > 0 ? parts.join('-') : token.name || '';

    return basis
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2') // fooBar -> foo-bar
      .replace(/[\s_]+/g, '-') // spaces/underscores -> hyphen
      .replace(/-+/g, '-') // collapse repeats
      .toLowerCase();
  },
};

const colorHexOrRgbaTransform = {
  type: 'value',
  matcher: isColorToken,
  transform: (token) => {
    const rawValue = getRawTokenValue(token);
    const hexValue = getHexValue(rawValue);
    if (hexValue) {
      return hexValue;
    }

    const srgbValue = getSrgbValue(rawValue);
    if (hasRgbShape(rawValue)) {
      if (!srgbValue || !validateRgbValue(srgbValue)) {
        const tokenName =
          token.name ||
          (Array.isArray(token.path) ? token.path.join('.') : 'unknown');
        const tokenFile = token.filePath || 'unknown file';
        throw new Error(
          `Invalid color token value for ${tokenName} in ${tokenFile}: ` +
            'expected hex or numeric rgb/rgba channels.',
        );
      }
    }
    const rgbaValue = srgbValue ? formatRgba(srgbValue) : null;
    return rgbaValue ?? rawValue;
  },
};

const cssVariablesNoSpaceCommasFormat = async ({
  dictionary,
  options = {},
  file,
}) => {
  const selector = Array.isArray(options.selector)
    ? options.selector
    : options.selector
      ? [options.selector]
      : [':root'];
  const { outputReferences, outputReferenceFallbacks, usesDtcg, formatting } =
    options;
  const header = await fileHeader({
    file,
    formatting: getFormattingCloneWithoutPrefix(formatting),
    options,
  });
  const indentation = formatting?.indentation || '  ';

  const nestInSelector = (content, currentSelector, indent) =>
    `${indent}${currentSelector} {\n${content}\n${indent}}`;

  const aliasInfoByName = new Map();
  if (outputReferences && usesDtcg) {
    for (const token of dictionary.allTokens) {
      const aliasInfo = getAliasInfo(token);
      if (!aliasInfo?.name) {
        continue;
      }
      const aliasKey = toKebab(aliasInfo.name);
      const setName = aliasInfo.setName ? toKebab(aliasInfo.setName) : null;
      if (!aliasInfoByName.has(aliasKey)) {
        aliasInfoByName.set(aliasKey, {
          setNames: new Set(),
          count: 0,
          missingSetName: false,
        });
      }
      const record = aliasInfoByName.get(aliasKey);
      record.count += 1;
      if (setName) {
        record.setNames.add(setName);
      } else {
        record.missingSetName = true;
      }
    }
  }
  const warnedAliases = new Set();
const warnAliasCollision = (message) => {
    if (options.log?.warnings === logWarningLevels.error) {
      throw new Error(message);
    }
    if (
      options.log?.warnings !== logWarningLevels.disabled &&
      options.log?.verbosity !== logVerbosityLevels.silent
    ) {
      console.warn(message);
    }
  };

  const dictionaryForAliases =
    outputReferences && usesDtcg
      ? {
          ...dictionary,
          allTokens: dictionary.allTokens.map((token) => {
            const aliasInfo = getAliasInfo(token);
            if (!aliasInfo) {
              return token;
            }
            const aliasKey = toKebab(aliasInfo.name);
            const record = aliasInfoByName.get(aliasKey);
            const hasCollision = record && record.count > 1;
            if (hasCollision && record.missingSetName) {
              throw new Error(
                `Alias name collision for "${aliasInfo.name}" without targetVariableSetName. ` +
                  `Cannot disambiguate in ${token.filePath || 'unknown file'}.`,
              );
            }
            if (hasCollision && record.setNames.size > 1 && !warnedAliases.has(aliasKey)) {
              warnAliasCollision(
                `Alias name collision for "${aliasInfo.name}". ` +
                  'Multiple collections share the same alias name.',
              );
              warnedAliases.add(aliasKey);
            }
            const aliasVar = `var(--${aliasKey})`;
            return {
              ...token,
              value: aliasVar,
              $value: aliasVar,
              original: {
                ...token.original,
                value: aliasVar,
                $value: aliasVar,
              },
            };
          }),
        }
      : dictionary;

  const variables = formattedVariables({
    format: propertyFormatNames.css,
    dictionary: dictionaryForAliases,
    outputReferences,
    outputReferenceFallbacks,
    formatting: {
      ...formatting,
      indentation: indentation.repeat(selector.length),
    },
    usesDtcg,
  });
  const variablesNoCommaSpaces = normalizeCommaSpacing(variables);

  return (
    header +
    selector
      .reverse()
      .reduce(
        (content, currentSelector, index) =>
          nestInSelector(
            content,
            currentSelector,
            indentation.repeat(selector.length - 1 - index),
          ),
        variablesNoCommaSpaces,
      ) +
    '\n'
  );
};

StyleDictionary.registerTransform({
  name: 'name/kebab-full',
  ...nameKebabFullTransform,
});

StyleDictionary.registerTransform({
  name: 'value/color-hex-or-rgba',
  ...colorHexOrRgbaTransform,
});

StyleDictionary.registerTransformGroup({
  name: 'css/without-group',
  transforms: [
    'name/kebab-full',
    'value/color-hex-or-rgba',
    'time/seconds',
    'size/px',
  ],
});

StyleDictionary.registerFormat({
  name: cssFormatName,
  format: cssVariablesNoSpaceCommasFormat,
});

// Per-file filters (POSIX-normalized absolute paths keep per-file token matching stable across OSes)
for (const { filterName, fullPathAbsPosix } of filtersToRegister) {
  StyleDictionary.registerFilter({
    name: filterName,
    filter: (token) => toAbsPosix(token.filePath) === fullPathAbsPosix,
  });
}

// ---- export the config object ----
export default {
  usesDtcg: true,
  // Keep all tokens loaded so references can be resolved / named consistently
  source: [`${toPosix(tokenBase)}/**/*.json`],

  // Logging behavior equivalent to your build.mjs
  log: {
    warnings: logWarningLevels.warn, // 'warn' | 'error' | 'disabled'
    verbosity: logVerbosityLevels.verbose, // 'default' | 'silent' | 'verbose'
    errors: {
      brokenReferences: logBrokenReferenceLevels.throw, // 'throw' | 'console'
    },
  },

  platforms: {
    css: {
      // Use our custom group with full-path kebab names
      transformGroup: 'css/without-group',
      buildPath: `${baseDir}/elements/`,
      files,
    },
  },
};
