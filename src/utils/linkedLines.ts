import { GraphNode } from '../types';

export interface LinkedLineItem {
  lineNum: number;
  text: string;
  type: 'import' | 'export' | 'call';
  tag: string;
  matchedDep?: string;
}

/**
 * Extracts specific lines of source code through which a graph node is linked
 * to other modules in the dependency graph (imports, exports, dependency calls).
 */
export function extractLinkedLines(node: GraphNode): LinkedLineItem[] {
  if (!node || !node.codePreview) return [];

  const allLines = node.codePreview.split('\n');
  const result: LinkedLineItem[] = [];

  allLines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // 1. Import statements (linking upstream dependencies)
    if (trimmed.startsWith('import ') || trimmed.startsWith('import{')) {
      const matchDep = node.dependencies?.find((dep) => {
        const baseName = dep.split('/').pop()?.replace(/\.[^/.]+$/, '') || '';
        return baseName && trimmed.includes(baseName);
      });
      result.push({
        lineNum: idx + 1,
        text: line,
        type: 'import',
        tag: 'IMPORT LINK',
        matchedDep: matchDep,
      });
      return;
    }

    // 2. Export statements (linking downstream consumers)
    if (trimmed.startsWith('export ') || trimmed.startsWith('export default')) {
      result.push({
        lineNum: idx + 1,
        text: line,
        type: 'export',
        tag: 'EXPORT CONTRACT',
      });
      return;
    }

    // 3. Direct caller usage lines matching dependencies
    if (node.dependencies && node.dependencies.length > 0) {
      const matchedDep = node.dependencies.find((dep) => {
        const cleanName = dep.split('/').pop()?.replace(/\.[^/.]+$/, '') || '';
        return cleanName && cleanName.length > 2 && trimmed.includes(cleanName);
      });

      if (matchedDep) {
        result.push({
          lineNum: idx + 1,
          text: line,
          type: 'call',
          tag: 'USAGE CALL',
          matchedDep,
        });
      }
    }
  });

  return result;
}

// Alias for backwards compatibility
export const getLinkedLinesForNode = extractLinkedLines;
