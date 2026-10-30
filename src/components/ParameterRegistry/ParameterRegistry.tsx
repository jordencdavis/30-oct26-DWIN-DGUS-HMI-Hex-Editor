/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useDwin } from '../../context/DwinContext';
import { Parameter, DwinDataType, VpRole } from '../../types/dwin';
import { formatVpHex, generateDwinFrame, encodeValueToBytes, parseNumericValue } from '../../utils/hexEngine';
import { 
  Plus, Search, Edit3, Trash2, Copy, AlertTriangle, ExternalLink, 
  Cpu, Hash, CheckCircle2, Sliders, X, ArrowDown, ArrowUp, Check,
  Layers, Monitor, Binary, FileSpreadsheet, ChevronLeft, ChevronRight
} from 'lucide-react';

const getGroupBadgeClass = (group: string) => {
  const g = group.toLowerCase();
  if (g.includes('chamber') || g.includes('env')) return 'bg-blue-50 text-blue-700 border-blue-200';
  if (g.includes('temp') || g.includes('therm')) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (g.includes('humid') || g.includes('sensor')) return 'bg-cyan-50 text-cyan-700 border-cyan-200';
  if (g.includes('press') || g.includes('safe') || g.includes('alarm')) return 'bg-rose-50 text-rose-700 border-rose-200';
  if (g.includes('control') || g.includes('calib')) return 'bg-purple-50 text-purple-700 border-purple-200';
  if (g.includes('status') || g.includes('diag')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-indigo-50 text-indigo-700 border-indigo-200';
};

const getRoleBadgeClass = (role: VpRole) => {
  switch (role) {
    case 'read_write':
      return 'bg-violet-100/80 text-violet-800 border-violet-300/70';
    case 'read_only':
      return 'bg-sky-100/80 text-sky-800 border-sky-300/70';
    case 'write_only':
      return 'bg-orange-100/80 text-orange-800 border-orange-300/70';
    case 'system_reg':
      return 'bg-amber-100/80 text-amber-800 border-amber-300/70';
    case 'touch_return':
      return 'bg-emerald-100/80 text-emerald-800 border-emerald-300/70';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-300';
  }
};

const formatRoleLabel = (role: VpRole): string => {
  switch (role) {
    case 'read_write':
      return 'Read / Write';
    case 'read_only':
      return 'Read Only';
    case 'write_only':
      return 'Write Only';
    case 'system_reg':
      return 'System Reg';
    case 'touch_return':
      return 'Touch Return';
    default:
      return role;
  }
};

const getRoleCommandBadge = (role: VpRole): string => {
  switch (role) {
    case 'write_only':
      return '0x82';
    case 'read_only':
      return '0x83';
    case 'read_write':
      return '0x82 / 0x83';
    case 'touch_return':
      return '0x84';
    case 'system_reg':
      return '0x80 / 0x81';
    default:
      return '0x82 / 0x83';
  }
};

/**
 * Returns formatted zero digits according to DWIN VP data type.
 * Since DWIN smart displays store no internal data, values are sent via UART.
 * - 2-digit data types (8-bit / byte / uint8 / int8) -> "00"
 * - 16-bit word data types (UINT16 / INT16) -> "0000" (raw UART: 00 00)
 * - 32-bit dword data types (UINT32 / INT32) -> "00000000" (raw UART: 00 00 00 00)
 * - Float32 -> "00000000" (raw UART: 0.00 / 00 00 00 00)
 * - Bitfield -> "0000" (16 discrete bit flags)
 * - String -> null-terminated zeros matching word length
 */
export const getZeroDigitsForDataType = (dataType: string, words: number = 1): { displayHex: string; rawZeros: string; typeTag: string } => {
  const dt = (dataType || '').toUpperCase();
  
  // 1. Two-digit data types (8-bit / Byte / char / uint8 / int8)
  if (dt === 'UINT8' || dt === 'INT8' || dt === 'BYTE' || dt.includes('8') || dt.includes('2 DIGIT') || dt.includes('2-DIGIT')) {
    return {
      displayHex: '00',
      rawZeros: '00',
      typeTag: '2-digit (1 Byte)'
    };
  }

  // 2. 16-bit word (UINT16, INT16, or 1 word)
  if (dt === 'UINT16' || dt === 'INT16') {
    return {
      displayHex: '0000',
      rawZeros: '00 00',
      typeTag: '4-digit (16-bit word)'
    };
  }

  // 3. 32-bit dword (UINT32, INT32, or 2 words)
  if (dt === 'UINT32' || dt === 'INT32') {
    return {
      displayHex: '00000000',
      rawZeros: '00 00 00 00',
      typeTag: '8-digit (32-bit dword)'
    };
  }

  // 4. Float32 (IEEE-754 32-bit float)
  if (dt === 'FLOAT32') {
    return {
      displayHex: '00000000',
      rawZeros: '00 00 00 00',
      typeTag: 'Float32 (4 Bytes)'
    };
  }

  // 5. Bitfield (16 discrete bit flags)
  if (dt === 'BITFIELD') {
    return {
      displayHex: '0000',
      rawZeros: '00 00',
      typeTag: 'Bitfield (16-bit)'
    };
  }

  // 6. String (Null-terminated ASCII string buffer)
  if (dt === 'STRING') {
    const byteCount = Math.max(2, (words || 1) * 2);
    return {
      displayHex: Array(byteCount).fill('00').join(''),
      rawZeros: Array(byteCount).fill('00').join(' '),
      typeTag: `String (${byteCount}B null)`
    };
  }

  // Fallback by word count
  if (words <= 1) {
    return {
      displayHex: '0000',
      rawZeros: '00 00',
      typeTag: '1 Word (16-bit)'
    };
  } else if (words === 2) {
    return {
      displayHex: '00000000',
      rawZeros: '00 00 00 00',
      typeTag: '2 Words (32-bit)'
    };
  } else {
    const bytes = words * 2;
    return {
      displayHex: '0'.repeat(bytes * 2),
      rawZeros: Array(bytes).fill('00').join(' '),
      typeTag: `${words} Words (${bytes}B)`
    };
  }
};

/**
 * Evaluates the real data value and returns its hex representation and raw UART bytes.
 * If data value is 0000 (0 / uninitialized / out of bounds), returns zero digits (e.g. "00 00").
 * If data value has a specific number, returns the exact equivalent hex bytes (e.g. 25 -> "00 19").
 */
export const formatParamValue = (param: Parameter): { displayHex: string; rawZeros: string; decimalVal: number | string } => {
  const dt = param.dataType;
  const words = param.words || 1;
  const val = param.defaultValue;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  const isZeroOrEmpty = val === undefined || val === null || val === '' || val === 0 || val === '0' || val === '0000' || isNaN(num) || num === 0;

  if (isZeroOrEmpty) {
    const zeros = getZeroDigitsForDataType(dt, words);
    return {
      displayHex: zeros.displayHex,
      rawZeros: zeros.rawZeros,
      decimalVal: 0
    };
  }

  // Guard against out-of-range overflows (like 100000 previously set for 32-bit now on UINT16)
  if (dt === 'UINT16' || dt === 'INT16' || dt === 'BITFIELD') {
    if (num > 65535 || num < -32768) {
      const zeros = getZeroDigitsForDataType(dt, words);
      return {
        displayHex: zeros.displayHex,
        rawZeros: zeros.rawZeros,
        decimalVal: 0
      };
    }
  } else if (dt === 'UINT8' || dt === 'INT8') {
    if (num > 255 || num < -128) {
      const zeros = getZeroDigitsForDataType(dt, words);
      return {
        displayHex: zeros.displayHex,
        rawZeros: zeros.rawZeros,
        decimalVal: 0
      };
    }
  }

  const bytes = encodeValueToBytes(val, dt, words);
  const displayHex = bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
  const rawZeros = bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

  return {
    displayHex,
    rawZeros,
    decimalVal: val
  };
};

const getQuickHexPreview = (param: Parameter, headerHex: string): string => {
  try {
    const valInfo = formatParamValue(param);
    const frame = generateDwinFrame({
      header: headerHex || '5A A5',
      command: 0x82,
      vpAddress: param.vpAddress,
      dataType: param.dataType,
      value: valInfo.decimalVal,
      wordCount: param.words || 1
    });
    return frame.rawHex;
  } catch {
    const valInfo = formatParamValue(param);
    const vpHigh = (param.vpAddress >> 8).toString(16).padStart(2, '0').toUpperCase();
    const vpLow = (param.vpAddress & 0xff).toString(16).padStart(2, '0').toUpperCase();
    const len = (3 + (param.words * 2)).toString(16).padStart(2, '0').toUpperCase();
    return `5A A5 ${len} 82 ${vpHigh} ${vpLow} ${valInfo.rawZeros}`;
  }
};

const STANDARD_UNITS = [
  '°C',
  '°F',
  '%',
  'RPM',
  'bar',
  'psi',
  'kPa',
  'V',
  'mV',
  'A',
  'mA',
  'W',
  'kW',
  'Hz',
  's',
  'ms',
  'min',
  'h',
  'gain',
  'enum',
  'state',
  'flags',
  'id',
  'events',
  'Unitless'
];

const SCALE_OPTIONS = [
  { value: 1, label: '1:1 (Direct integer)' },
  { value: 10, label: '1/10 (0.1 resolution)' },
  { value: 100, label: '1/100 (0.01 resolution)' },
  { value: 1000, label: '1/1000 (0.001 resolution)' },
  { value: 2, label: '1/2 (0.5 resolution)' },
  { value: 5, label: '1/5 (0.2 resolution)' },
];

const DATA_TYPE_OPTIONS: { value: DwinDataType; label: string }[] = [
  { value: 'UINT16', label: 'UINT16 (16-bit word / 4 digits)' },
  { value: 'INT16', label: 'INT16 (Signed 16-bit / 4 digits)' },
  { value: 'UINT8', label: 'UINT8 (8-bit byte / 2 digits)' },
  { value: 'INT8', label: 'INT8 (Signed 8-bit / 2 digits)' },
  { value: 'UINT32', label: 'UINT32 (32-bit dword / 8 digits)' },
  { value: 'INT32', label: 'INT32 (Signed 32-bit / 8 digits)' },
  { value: 'FLOAT32', label: 'FLOAT32 (IEEE-754 / 4 bytes)' },
  { value: 'STRING', label: 'STRING (ASCII string buffer)' },
  { value: 'BITFIELD', label: 'BITFIELD (16-bit status mask)' },
];

export const ParameterRegistry: React.FC = () => {
  const {
    project,
    addParameter,
    updateParameter,
    deleteParameter,
    duplicateParameter,
    jumpToHexLabWithParam,
    selectedParamId,
    setSelectedParamId,
    setSelectedScreenId,
    setActiveTab,
    openBatchScreenCreator,
    addScreen,
    updateScreen,
    addVpBindingToScreen,
    removeVpBindingFromScreen
  } = useDwin();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingParam, setEditingParam] = useState<Parameter | null>(null);

  // Active screen for header operations
  const [headerTargetScreenId, setHeaderTargetScreenId] = useState<string>(project.screens[0]?.id || '');

  useEffect(() => {
    if (!project.screens.some(s => s.id === headerTargetScreenId)) {
      if (project.screens.length > 0) {
        setHeaderTargetScreenId(project.screens[0].id);
      }
    }
  }, [project.screens, headerTargetScreenId]);

  // Inline parameter name editing (double-click, no modal)
  const [inlineEditingParamId, setInlineEditingParamId] = useState<string | null>(null);
  const [inlineEditingName, setInlineEditingName] = useState('');

  const handleStartInlineEdit = (param: Parameter) => {
    setInlineEditingParamId(param.id);
    setInlineEditingName(param.name);
  };

  const handleSaveInlineName = (paramId: string) => {
    const trimmed = inlineEditingName.trim();
    if (trimmed) {
      updateParameter(paramId, { name: trimmed });
    }
    setInlineEditingParamId(null);
    setInlineEditingName('');
  };

  const handleCancelInlineEdit = () => {
    setInlineEditingParamId(null);
    setInlineEditingName('');
  };

  // Inline VP address editing (double-click on VP hex, no modal)
  const [inlineEditingVpParamId, setInlineEditingVpParamId] = useState<string | null>(null);
  const [inlineEditingVpHex, setInlineEditingVpHex] = useState('');

  const handleStartInlineVpEdit = (param: Parameter) => {
    setInlineEditingVpParamId(param.id);
    setInlineEditingVpHex(formatVpHex(param.vpAddress));
  };

  const handleSaveInlineVp = (param: Parameter) => {
    const cleanHex = inlineEditingVpHex.trim().replace(/^0x/i, '');
    const parsed = parseInt(cleanHex, 16);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 0xFFFF) {
      if (parsed !== param.vpAddress) {
        const oldAddress = param.vpAddress;
        updateParameter(param.id, { vpAddress: parsed });
        // Update all screens with this VP binding
        project.screens.forEach(s => {
          if (s.vpBindings.some(b => b.vpAddress === oldAddress)) {
            updateScreen(s.id, {
              vpBindings: s.vpBindings.map(b => b.vpAddress === oldAddress ? { ...b, vpAddress: parsed } : b)
            });
          }
        });
      }
    }
    setInlineEditingVpParamId(null);
    setInlineEditingVpHex('');
  };

  const handleCancelInlineVpEdit = () => {
    setInlineEditingVpParamId(null);
    setInlineEditingVpHex('');
  };

  // Inline Value editing (double-click on Value or zero digits)
  const [inlineEditingValParamId, setInlineEditingValParamId] = useState<string | null>(null);
  const [inlineEditingValStr, setInlineEditingValStr] = useState('');

  const handleStartInlineValEdit = (param: Parameter) => {
    setInlineEditingValParamId(param.id);
    setInlineEditingValStr(String(param.defaultValue ?? 0));
  };

  const handleSaveInlineVal = (param: Parameter) => {
    const trimmed = inlineEditingValStr.trim();
    let parsed: number | string = 0;
    if (/^0x[0-9a-fA-F]+$/i.test(trimmed)) {
      parsed = parseInt(trimmed, 16) || 0;
    } else if (param.dataType === 'STRING') {
      parsed = trimmed;
    } else if (param.dataType === 'FLOAT32') {
      parsed = parseFloat(trimmed) || 0;
    } else {
      parsed = parseFloat(trimmed) || 0;
    }
    updateParameter(param.id, { defaultValue: parsed });
    setInlineEditingValParamId(null);
    setInlineEditingValStr('');
  };

  const handleCancelInlineValEdit = () => {
    setInlineEditingValParamId(null);
    setInlineEditingValStr('');
  };

  // Helper to reassign/change screen for a VP address
  const handleScreenChangeForVp = (param: Parameter, targetScreenId: string) => {
    // Unbind from all current screens
    project.screens.forEach(s => {
      const matchingBindings = s.vpBindings.filter(b => b.vpAddress === param.vpAddress);
      matchingBindings.forEach(b => {
        removeVpBindingFromScreen(s.id, b.id);
      });
    });

    // Bind to target screen if chosen
    if (targetScreenId && targetScreenId !== '__CREATE_NEW__') {
      addVpBindingToScreen(targetScreenId, {
        vpAddress: param.vpAddress,
        role: param.role === 'touch_return' ? 'touch_input' : 'data_display',
        label: param.name,
        x: 100,
        y: 100,
        width: 140,
        height: 44,
        notes: `Assigned from Parameter Registry`
      });
    }
  };

  // Optional toggle to test or simulate 1190 sequence being occupied
  const [simulate1190Occupied, setSimulate1190Occupied] = useState(false);

  // Check if a VP address is occupied in project parameters or screen bindings
  const isVpOccupied = (addr: number, words: number = 1): boolean => {
    if (simulate1190Occupied && (addr === 0x1190 || (words > 1 && addr + 2 === 0x1190))) {
      return true;
    }
    for (const p of project.parameters) {
      const pWords = p.words || (p.dataType === 'UINT32' || p.dataType === 'INT32' || p.dataType === 'FLOAT32' ? 2 : 1);
      if (p.vpAddress === addr) return true;
      if (words > 1 && p.vpAddress === addr + 2) return true;
      if (pWords > 1 && (addr >= p.vpAddress && addr < p.vpAddress + pWords * 2)) return true;
    }
    for (const s of project.screens) {
      for (const b of s.vpBindings) {
        if (b.vpAddress === addr) return true;
        if (words > 1 && b.vpAddress === addr + 2) return true;
      }
    }
    return false;
  };

  // Helper to step continuous decimal-hex VP addresses:
  // e.g. 1188 -> 1190. If 1190 sequence is not available (occupied), allocates next sequence 1200.
  const getNextContinuousVp = (
    currentAddr: number,
    step: number,
    wordSize: number,
    allocatedInBatch: Set<number>
  ): number => {
    const hexStr = (currentAddr & 0xffff).toString(16);
    const cleanDigits = hexStr.replace(/[^0-9]/g, '');
    let decVal = cleanDigits.length > 0 ? parseInt(cleanDigits, 10) : currentAddr;

    // Next candidate in continuous decimal numbering (e.g. 1188 + 2 -> 1190)
    let nextDec = decVal + step;
    let candidateHex = parseInt(nextDec.toString(10), 16);

    const isTaken = (hex: number) => isVpOccupied(hex, wordSize) || allocatedInBatch.has(hex);

    // If candidate sequence is not available, jump to next sequence (e.g. 1190 not available -> 1200)
    while (isTaken(candidateHex) || isNaN(candidateHex)) {
      // Jump to start of next sequence/decade (e.g. 1190 -> 1200, 1200 -> 1210 or 1300)
      nextDec = Math.ceil((nextDec + 1) / 10) * 10;
      candidateHex = parseInt(nextDec.toString(10), 16);
      if (candidateHex > 0xFFFF) break;
    }

    return candidateHex;
  };

  // Generate full batch of continuous VP addresses according to continuous decimal-hex rule
  const generateContinuousBatchAddresses = (
    startHexInput: string,
    count: number,
    step: number,
    wordSize: number
  ): number[] => {
    const safeCount = Math.min(Math.max(1, count), 20);
    const rawDigits = startHexInput.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
    let startAddr: number;

    if (rawDigits.length > 0) {
      const parsed = parseInt(rawDigits, 16);
      startAddr = (!isNaN(parsed) && parsed >= 0 && parsed <= 0xFFFF) ? parsed : getNextAvailableVp();
    } else {
      startAddr = getNextAvailableVp();
    }

    const addresses: number[] = [];
    const allocatedInBatch = new Set<number>();

    // Check if initial address is occupied, if so jump to next available sequence
    let current = startAddr;
    if (isVpOccupied(current, wordSize)) {
      const hexStr = (current & 0xffff).toString(16).replace(/[^0-9]/g, '');
      let decVal = hexStr.length > 0 ? parseInt(hexStr, 10) : current;
      while (isVpOccupied(current, wordSize)) {
        decVal = Math.ceil((decVal + 1) / 10) * 10;
        current = parseInt(decVal.toString(10), 16);
        if (current > 0xFFFF) break;
      }
    }

    addresses.push(current);
    allocatedInBatch.add(current);

    for (let i = 1; i < safeCount; i++) {
      const nextAddr = getNextContinuousVp(current, step, wordSize, allocatedInBatch);
      addresses.push(nextAddr);
      allocatedInBatch.add(nextAddr);
      current = nextAddr;
    }

    return addresses;
  };

  // Helper to get next free VP address in continuous sequence
  const getNextAvailableVp = (): number => {
    let highest = 0x1000;
    project.parameters.forEach(p => {
      const hexStr = (p.vpAddress & 0xffff).toString(16).replace(/[^0-9]/g, '');
      const dec = hexStr.length > 0 ? parseInt(hexStr, 10) : p.vpAddress;
      const words = p.words || (p.dataType === 'UINT32' || p.dataType === 'INT32' || p.dataType === 'FLOAT32' ? 2 : 1);
      const endDec = dec + words * 2;
      if (endDec > highest) highest = endDec;
    });
    project.screens.forEach(s => {
      s.vpBindings.forEach(b => {
        const hexStr = (b.vpAddress & 0xffff).toString(16).replace(/[^0-9]/g, '');
        const dec = hexStr.length > 0 ? parseInt(hexStr, 10) : b.vpAddress;
        if (dec + 2 > highest) highest = dec + 2;
      });
    });
    let nextDec = (highest % 2 === 0) ? highest : highest + 1;
    if (nextDec % 10 === 9) nextDec += 1;
    let candidateHex = parseInt(nextDec.toString(10), 16);
    while (isVpOccupied(candidateHex, 1)) {
      nextDec = Math.ceil((nextDec + 1) / 10) * 10;
      candidateHex = parseInt(nextDec.toString(10), 16);
      if (candidateHex > 0xFFFF) break;
    }
    return candidateHex;
  };

  // Helper to safely parse VP address input or fallback to next available sequence address
  const getEffectiveBatchStartAddr = (inputHex: string): number => {
    const digitsOnly = inputHex.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
    if (!digitsOnly) {
      return getNextAvailableVp();
    }
    const parsed = parseInt(digitsOnly, 16);
    if (isNaN(parsed) || parsed < 0 || parsed > 0xFFFF) {
      return getNextAvailableVp();
    }
    return parsed;
  };

  // Helper to get next free screen number
  const getNextAvailableScreenNumber = (): number => {
    const existing = new Set(project.screens.map(s => s.screenNumber));
    let num = 0;
    while (existing.has(num)) num++;
    return num;
  };

  // Quick Create Screen Modal state
  const [isQuickCreateScreenModalOpen, setIsQuickCreateScreenModalOpen] = useState(false);
  const [quickCreateParamToBind, setQuickCreateParamToBind] = useState<Parameter | null>(null);
  const [newScreenName, setNewScreenName] = useState('');
  const [newScreenNumber, setNewScreenNumber] = useState(0);
  const [newScreenGroup, setNewScreenGroup] = useState('Operator UI');

  const handleOpenCreateScreenForParam = (param?: Parameter) => {
    setQuickCreateParamToBind(param || null);
    const nextNum = getNextAvailableScreenNumber();
    setNewScreenNumber(nextNum);
    setNewScreenName(`Screen ${nextNum}`);
    setNewScreenGroup('Operator UI');
    setIsQuickCreateScreenModalOpen(true);
  };

  const handleSaveQuickCreateScreen = (e: React.FormEvent) => {
    e.preventDefault();
    const created = addScreen({
      screenNumber: newScreenNumber,
      name: newScreenName.trim() || `Screen ${newScreenNumber}`,
      group: newScreenGroup.trim() || 'Operator UI',
      resolution: project.resolution,
      bgImageIndex: newScreenNumber,
      bgImageUrl: project.screens[0]?.bgImageUrl || '',
      description: 'Created from Parameter Registry',
      vpBindings: [],
      navigations: []
    });

    setHeaderTargetScreenId(created.id);
    setTargetScreenForAddVp(created.id);
    setBatchTargetScreenId(created.id);

    if (quickCreateParamToBind) {
      handleScreenChangeForVp(quickCreateParamToBind, created.id);
    }

    setIsQuickCreateScreenModalOpen(false);
    setQuickCreateParamToBind(null);
  };

  // Add VP for Screen Modal state
  const [isAddVpForScreenModalOpen, setIsAddVpForScreenModalOpen] = useState(false);
  const [targetScreenForAddVp, setTargetScreenForAddVp] = useState<string>(project.screens[0]?.id || '');
  const [newVpName, setNewVpName] = useState('');
  const [newVpIdentifier, setNewVpIdentifier] = useState('');
  const [newVpHex, setNewVpHex] = useState('0x1050');
  const [newVpDataType, setNewVpDataType] = useState<DwinDataType>('UINT16');
  const [newVpWords, setNewVpWords] = useState(1);
  const [newVpUnit, setNewVpUnit] = useState('');
  const [newVpScale, setNewVpScale] = useState(1);
  const [newVpMin, setNewVpMin] = useState(0);
  const [newVpMax, setNewVpMax] = useState(100);
  const [newVpDefault, setNewVpDefault] = useState<string | number>(0);
  const [newVpRole, setNewVpRole] = useState<VpRole>('read_write');
  const [newVpGroup, setNewVpGroup] = useState('Operator UI');
  const [newVpDescription, setNewVpDescription] = useState('');

  const handleOpenAddVpForScreen = (screenId?: string) => {
    const targetId = screenId || headerTargetScreenId || project.screens[0]?.id || '';
    setTargetScreenForAddVp(targetId);
    const nextVp = getNextAvailableVp();
    setNewVpHex(formatVpHex(nextVp));
    setNewVpName('');
    setNewVpIdentifier('');
    setNewVpDataType('UINT16');
    setNewVpWords(1);
    setNewVpUnit('');
    setNewVpScale(1);
    setNewVpMin(0);
    setNewVpMax(100);
    setNewVpDefault(0);
    setNewVpRole('read_write');
    setNewVpGroup('Operator UI');
    setNewVpDescription('');
    setIsAddVpForScreenModalOpen(true);
  };

  const handleSaveAddVpForScreen = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanHex = newVpHex.trim().replace(/^0x/i, '');
    const vpAddress = parseInt(cleanHex, 16) || 0x1000;
    const paramName = newVpName.trim() || `VP_${formatVpHex(vpAddress)}`;
    const identifier = newVpIdentifier.trim() || paramName.toUpperCase().replace(/[^A-Z0-9]/g, '_');

    addParameter({
      name: paramName,
      identifier,
      vpAddress,
      dataType: newVpDataType,
      words: Number(newVpWords) || 1,
      unit: newVpUnit.trim(),
      scale: Number(newVpScale) || 1,
      min: Number(newVpMin),
      max: Number(newVpMax),
      defaultValue: newVpDefault,
      role: newVpRole,
      group: newVpGroup.trim() || 'Operator UI',
      description: newVpDescription.trim()
    });

    if (targetScreenForAddVp) {
      addVpBindingToScreen(targetScreenForAddVp, {
        vpAddress,
        role: newVpRole === 'touch_return' ? 'touch_input' : 'data_display',
        label: paramName,
        x: 100,
        y: 100,
        width: 140,
        height: 44,
        notes: 'Bound to Screen from Parameter Registry'
      });
    }

    setIsAddVpForScreenModalOpen(false);
  };

  // Batch Add VPs for Screen Modal state
  interface BatchVpItem {
    id: string;
    name: string;
    vpAddressHex: string;
    dataType: DwinDataType;
    role: VpRole;
  }

  const [isBatchVpModalOpen, setIsBatchVpModalOpen] = useState(false);
  const [batchTargetScreenId, setBatchTargetScreenId] = useState<string>(project.screens[0]?.id || '');
  const [batchVpStartHex, setBatchVpStartHex] = useState('0x1070');
  const [batchVpCount, setBatchVpCount] = useState(4);
  const [batchItems, setBatchItems] = useState<BatchVpItem[]>([]);
  const [batchSuccessMsg, setBatchSuccessMsg] = useState('');

  // Helper to re-generate sequence items when start VP or count changes
  const generateBatchItemsFromStart = (startHexInput: string, count: number): BatchVpItem[] => {
    const safeCount = Math.min(Math.max(1, count), 20);
    const addrs = generateContinuousBatchAddresses(startHexInput, safeCount, 2, 1);
    return addrs.map((addr, i) => ({
      id: `batch_item_${i}_${Date.now()}`,
      name: `Parameter ${i + 1}`,
      vpAddressHex: formatVpHex(addr),
      dataType: 'UINT16',
      role: 'read_write'
    }));
  };

  const handleOpenBatchVpForScreen = (screenId?: string) => {
    const targetId = screenId || headerTargetScreenId || project.screens[0]?.id || '';
    setBatchTargetScreenId(targetId);
    const nextVp = getNextAvailableVp();
    const startHex = formatVpHex(nextVp);
    setBatchVpStartHex(startHex);
    setBatchVpCount(4);
    setBatchSuccessMsg('');

    const items = generateBatchItemsFromStart(startHex, 4);
    setBatchItems(items);
    setIsBatchVpModalOpen(true);
  };

  const handleStartHexChange = (newHex: string) => {
    setBatchVpStartHex(newHex);
    setBatchItems(prev => {
      const safeCount = Math.min(Math.max(1, batchVpCount), 20);
      const wordSize = 1;
      const addrs = generateContinuousBatchAddresses(newHex, safeCount, 2, wordSize);
      return addrs.map((addr, i) => ({
        id: prev[i]?.id || `batch_item_${i}_${Date.now()}`,
        name: prev[i]?.name || `Parameter ${i + 1}`,
        vpAddressHex: formatVpHex(addr),
        dataType: prev[i]?.dataType || 'UINT16',
        role: prev[i]?.role || 'read_write'
      }));
    });
  };

  const handleBatchCountChange = (newCount: number) => {
    const safeCount = Math.min(Math.max(1, newCount), 20);
    setBatchVpCount(safeCount);
    setBatchItems(prev => {
      const addrs = generateContinuousBatchAddresses(batchVpStartHex, safeCount, 2, 1);
      return addrs.map((addr, i) => ({
        id: prev[i]?.id || `batch_item_${i}_${Date.now()}`,
        name: prev[i]?.name || `Parameter ${i + 1}`,
        vpAddressHex: prev[i]?.vpAddressHex || formatVpHex(addr),
        dataType: prev[i]?.dataType || 'UINT16',
        role: prev[i]?.role || 'read_write'
      }));
    });
  };

  const handleUpdateBatchItem = (index: number, field: keyof BatchVpItem, value: any) => {
    setBatchItems(prev => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], [field]: value };
      }
      return updated;
    });
  };

  const handleAutoSequenceReset = () => {
    const nextVp = getNextAvailableVp();
    const nextHex = formatVpHex(nextVp);
    setBatchVpStartHex(nextHex);
    const items = generateBatchItemsFromStart(nextHex, batchVpCount);
    setBatchItems(items);
  };

  const handleExecuteBatchVpForScreen = (e: React.FormEvent) => {
    e.preventDefault();
    if (batchItems.length === 0) return;

    const targetScreen = project.screens.find(s => s.id === batchTargetScreenId);

    batchItems.forEach((item, i) => {
      const cleanHex = item.vpAddressHex.trim().replace(/^0x/i, '');
      const addr = parseInt(cleanHex, 16) || 0x1000;
      const wordSize = (item.dataType === 'UINT32' || item.dataType === 'INT32' || item.dataType === 'FLOAT32') ? 2 : 1;
      const paramName = item.name.trim() || `Parameter ${i + 1}`;
      const identifier = `${paramName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${formatVpHex(addr).replace('0x','')}`;

      addParameter({
        name: paramName,
        identifier,
        vpAddress: addr,
        dataType: item.dataType,
        words: wordSize,
        unit: '',
        scale: 1,
        min: 0,
        max: 100,
        defaultValue: 0,
        role: item.role,
        group: targetScreen?.name || 'Operator UI',
        description: `Batch parameter #${i + 1} allocated with ${item.dataType} and ${formatRoleLabel(item.role)} for ${targetScreen?.name || 'Screen'}.`
      });

      if (batchTargetScreenId) {
        addVpBindingToScreen(batchTargetScreenId, {
          vpAddress: addr,
          role: item.role === 'touch_return' ? 'touch_input' : 'data_display',
          label: paramName,
          x: 100 + (i % 3) * 160,
          y: 100 + Math.floor(i / 3) * 60,
          width: 140,
          height: 44,
          notes: `Batch allocated VP (${item.dataType}, ${formatRoleLabel(item.role)}) for ${targetScreen?.name || 'Screen'}`
        });
      }
    });

    const firstHex = batchItems[0]?.vpAddressHex || '';
    const lastHex = batchItems[batchItems.length - 1]?.vpAddressHex || '';
    setBatchSuccessMsg(`Successfully created and registered ${batchItems.length} parameters (${firstHex} to ${lastHex}) on ${targetScreen?.name || 'screen'}!`);
    setTimeout(() => {
      setIsBatchVpModalOpen(false);
      setBatchSuccessMsg('');
    }, 1200);
  };

  // Form states
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [vpHexInput, setVpHexInput] = useState('0x1000');
  const [dataType, setDataType] = useState<DwinDataType>('UINT16');
  const [words, setWords] = useState(1);
  const [unit, setUnit] = useState('°C');
  const [scale, setScale] = useState(1);
  const [minVal, setMinVal] = useState(0);
  const [maxVal, setMaxVal] = useState(100);
  const [defaultVal, setDefaultVal] = useState<string | number>(25);
  const [role, setRole] = useState<VpRole>('read_write');
  const [group, setGroup] = useState('Thermal Loop');
  const [description, setDescription] = useState('');

  // Groups
  const groups = Array.from(new Set(project.parameters.map(p => p.group))).filter(Boolean);

  // Check for duplicate / overlapping VP addresses
  const vpOccupancy = new Map<number, Parameter[]>();
  project.parameters.forEach(p => {
    for (let i = 0; i < p.words; i++) {
      const addr = p.vpAddress + i;
      const list = vpOccupancy.get(addr) || [];
      list.push(p);
      vpOccupancy.set(addr, list);
    }
  });

  const getOverlapConflict = (param: Parameter): string | null => {
    for (let i = 0; i < param.words; i++) {
      const addr = param.vpAddress + i;
      const list = vpOccupancy.get(addr);
      if (list && list.length > 1) {
        const others = list.filter(p => p.id !== param.id).map(p => `"${p.name}" (${formatVpHex(p.vpAddress)})`);
        if (others.length > 0) {
          return `Overlaps address ${formatVpHex(addr)} with: ${others.join(', ')}`;
        }
      }
    }
    return null;
  };

  const filteredParameters = project.parameters.filter(p => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = 
      p.name.toLowerCase().includes(q) ||
      p.identifier.toLowerCase().includes(q) ||
      formatVpHex(p.vpAddress).toLowerCase().includes(q) ||
      p.unit.toLowerCase().includes(q) ||
      p.dataType.toLowerCase().includes(q);
    const matchesGroup = selectedGroup === 'all' || p.group === selectedGroup;
    return matchesSearch && matchesGroup;
  });

  const handleOpenAdd = () => {
    setEditingParam(null);
    const highestVp = project.parameters.reduce((max, p) => Math.max(max, p.vpAddress + p.words), 0x1000);
    setName('');
    setIdentifier('');
    setVpHexInput(formatVpHex(highestVp));
    setDataType('UINT16');
    setWords(1);
    setUnit('');
    setScale(1);
    setMinVal(0);
    setMaxVal(100);
    setDefaultVal(0);
    setRole('read_write');
    setGroup('Thermal Loop');
    setDescription('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: Parameter) => {
    setEditingParam(p);
    setName(p.name);
    setIdentifier(p.identifier);
    setVpHexInput(formatVpHex(p.vpAddress));
    setDataType(p.dataType);
    setWords(p.words);
    setUnit(p.unit);
    setScale(p.scale);
    setMinVal(p.min);
    setMaxVal(p.max);
    setDefaultVal(p.defaultValue);
    setRole(p.role);
    setGroup(p.group);
    setDescription(p.description);
    setIsModalOpen(true);
  };

  const handleDataTypeChange = (type: DwinDataType) => {
    setDataType(type);
    if (type === 'UINT32' || type === 'INT32' || type === 'FLOAT32') {
      setWords(2);
    } else if (type === 'STRING') {
      setWords(10);
    } else {
      setWords(1);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanHex = vpHexInput.trim().replace(/^0x/i, '');
    const vpAddress = parseInt(cleanHex, 16) || 0x1000;

    const payload = {
      name: name.trim() || 'Unnamed Parameter',
      identifier: identifier.trim() || name.toUpperCase().replace(/[^A-Z0-9]/g, '_') || 'PARAM',
      vpAddress,
      dataType,
      words: Number(words) || 1,
      unit: unit.trim(),
      scale: Number(scale) || 1,
      min: Number(minVal),
      max: Number(maxVal),
      defaultValue: defaultVal,
      role,
      group: group.trim() || 'General',
      description: description.trim()
    };

    if (editingParam) {
      updateParameter(editingParam.id, payload);
    } else {
      addParameter(payload);
    }

    setIsModalOpen(false);
  };

  return (
    <div className="space-y-5 w-full max-w-full">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-lg p-5 shadow-xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Parameter Registry
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Define each DGUS parameter once. Configure engineering units, word sizes, VP addresses, permitted range, scaling factor, and roles.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap self-start sm:self-auto shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Define Parameter</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 shadow-xs">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by parameter name, identifier, VP address (e.g. 0x1000), or unit..."
              className="w-full text-xs pl-8 pr-3 py-1.5 rounded-md border border-slate-300 bg-slate-50 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Group Filter */}
          <div className="flex items-center gap-1 overflow-x-auto text-xs shrink-0">
            <button
              onClick={() => setSelectedGroup('all')}
              className={`px-2.5 py-1 rounded text-xs transition-colors whitespace-nowrap ${
                selectedGroup === 'all'
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              All Groups ({project.parameters.length})
            </button>
            {groups.map(g => (
              <button
                key={g}
                onClick={() => setSelectedGroup(g)}
                className={`px-2.5 py-1 rounded text-xs transition-colors whitespace-nowrap ${
                  selectedGroup === g
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Screen Operations & Rapid VP Action Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-700 font-bold">
            <Monitor className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>Target Screen:</span>
          </div>
          <select
            value={headerTargetScreenId}
            onChange={e => {
              if (e.target.value === '__NEW_SCREEN__') {
                handleOpenCreateScreenForParam();
              } else {
                setHeaderTargetScreenId(e.target.value);
              }
            }}
            className="text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs cursor-pointer max-w-[200px] truncate"
            title="Select target screen for VP operations"
          >
            {project.screens.map(s => (
              <option key={s.id} value={s.id}>
                #{s.screenNumber} {s.name}
              </option>
            ))}
            <option value="__NEW_SCREEN__">+ New Screen...</option>
          </select>

          {/* Quick Screen Navigation (< >) */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                const idx = project.screens.findIndex(s => s.id === headerTargetScreenId);
                if (idx > 0) setHeaderTargetScreenId(project.screens[idx - 1].id);
              }}
              disabled={project.screens.findIndex(s => s.id === headerTargetScreenId) <= 0}
              className="p-1.5 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors border border-slate-200 bg-white shadow-2xs cursor-pointer"
              title="Previous Screen (<)"
              aria-label="Previous Screen"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                const idx = project.screens.findIndex(s => s.id === headerTargetScreenId);
                if (idx >= 0 && idx < project.screens.length - 1) setHeaderTargetScreenId(project.screens[idx + 1].id);
              }}
              disabled={project.screens.findIndex(s => s.id === headerTargetScreenId) >= project.screens.length - 1}
              className="p-1.5 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors border border-slate-200 bg-white shadow-2xs cursor-pointer"
              title="Next Screen (>)"
              aria-label="Next Screen"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => handleOpenAddVpForScreen(headerTargetScreenId)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
            title="Add new VP Address and Parameter for this screen"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add VP</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenBatchVpForScreen(headerTargetScreenId)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
            title="Batch generate multiple VP addresses for this screen"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Batch VPs</span>
          </button>

          {/* SCREEN Lab Button (copy placed near Batch VPs) */}
          <button
            type="button"
            onClick={() => setActiveTab('screenlab')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-700 hover:bg-indigo-800 active:bg-indigo-900 text-white font-semibold text-xs shadow-2xs transition-all cursor-pointer active:scale-95 border border-indigo-500/30"
            title="Open SCREEN Lab: batch auto-generate multiple DGUS screens and VP bindings"
          >
            <Layers className="w-3.5 h-3.5 text-indigo-100" />
            <span>SCREEN Lab</span>
          </button>

          {/* New Screen Button */}
          <button
            type="button"
            onClick={() => handleOpenCreateScreenForParam()}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs shadow-2xs transition-all cursor-pointer active:scale-95"
            title="Create a new screen directly from Parameter Registry"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ New Screen</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('import_export')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
            title="Export full Parameter Registry Schema (.csv, .txt, .xlsx) for other GUIs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export Schema (.csv/.txt/.xlsx)</span>
          </button>
        </div>

        <div className="text-xs text-slate-500 font-mono">
          Showing <span className="font-bold text-slate-800">{filteredParameters.length}</span> of {project.parameters.length} parameters
        </div>
      </div>

      {/* Main Parameters Table */}
      <div 
        className="border border-slate-200 rounded-lg overflow-hidden shadow-xs bg-white"
      >
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 font-semibold text-xs">
                {/* Column 1: Screen & VP Address */}
                <th className="py-2 px-2.5 bg-blue-100/90 text-blue-900 border-l-4 border-l-blue-600 border-r border-blue-200/80 w-[18%] min-w-[145px] align-middle">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-[11px] uppercase tracking-wider text-blue-950">Screen &amp; VP</span>
                    <span className="text-[10px] text-blue-700 font-normal">Assigned · Hex VP</span>
                  </div>
                </th>

                {/* Column 2: Parameter Name & Key */}
                <th className="py-2 px-2.5 bg-amber-100/90 text-amber-900 border-l-4 border-l-amber-600 border-r border-amber-200/80 w-[20%] min-w-[140px] align-middle">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-[11px] uppercase tracking-wider text-amber-950">Parameter Name</span>
                    <span className="text-[10px] text-amber-700 font-normal">Identifier &amp; Group</span>
                  </div>
                </th>

                {/* Column 3: Unit & Scaling (Targeted by CSS selector 2) */}
                <th className="py-2 px-2.5 bg-cyan-100/90 text-cyan-900 border-l-4 border-l-cyan-600 border-r border-cyan-200/80 w-[16%] min-w-[125px] align-middle">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1">
                      <Sliders className="w-3 h-3 text-cyan-700" />
                      <span className="font-bold text-[11px] uppercase tracking-wider text-cyan-950">Unit &amp; Scale</span>
                    </div>
                    <span className="text-[10px] text-cyan-700 font-normal">Select for VP</span>
                  </div>
                </th>

                {/* Column 4: Data Type (Targeted by CSS selector 1) */}
                <th className="py-2 px-2.5 bg-indigo-100/90 text-indigo-950 border-l-4 border-l-indigo-600 border-r border-indigo-200/80 w-[16%] min-w-[125px] align-middle">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1">
                      <Cpu className="w-3 h-3 text-indigo-700" />
                      <span className="font-bold text-[11px] uppercase tracking-wider text-indigo-950">Data Type</span>
                    </div>
                    <span className="text-[10px] text-indigo-700 font-normal">Select for VP</span>
                  </div>
                </th>

                {/* Column 5: Value (UART Zero Digits based on DWIN data type) */}
                <th className="py-2 px-2.5 bg-emerald-100/90 text-emerald-950 border-l-4 border-l-emerald-600 border-r border-emerald-200/80 w-[14%] min-w-[115px] align-middle">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1">
                      <Binary className="w-3 h-3 text-emerald-700" />
                      <span className="font-bold text-[11px] uppercase tracking-wider text-emerald-950">Value</span>
                    </div>
                    <span className="text-[10px] text-emerald-700 font-normal">UART Zeros</span>
                  </div>
                </th>

                {/* Column 6: Role & DWIN Cmd */}
                <th className="py-2 px-2.5 bg-violet-100/90 text-violet-900 border-l-4 border-l-violet-600 border-r border-violet-200/80 w-[10%] min-w-[95px] align-middle">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-[11px] uppercase tracking-wider text-violet-950">Role &amp; Cmd</span>
                    <span className="text-[10px] text-violet-700 font-normal">Access Mode</span>
                  </div>
                </th>

                {/* Column 7: Actions & HEX Frame */}
                <th className="py-2 px-2.5 bg-slate-200/90 text-slate-800 border-l-4 border-l-slate-600 text-right w-[12%] min-w-[115px] align-middle">
                  <div className="flex flex-col gap-0.5 items-end">
                    <span className="font-bold text-[11px] uppercase tracking-wider text-slate-900">Actions</span>
                    <span className="text-[10px] text-slate-600 font-normal">HEX Lab &amp; Edit</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredParameters.map((param, idx) => {
                const conflict = getOverlapConflict(param);
                const boundScreens = project.screens.filter(s =>
                  s.vpBindings && s.vpBindings.some(vp => vp.vpAddress === param.vpAddress)
                );
                return (
                  <tr
                    key={param.id}
                    onClick={() => setSelectedParamId(param.id)}
                    className={`transition-colors cursor-pointer ${
                      selectedParamId === param.id
                        ? 'bg-blue-50/70 ring-1 ring-blue-500/30'
                        : conflict
                        ? 'bg-amber-50/60 hover:bg-amber-100/50'
                        : idx % 2 === 1
                        ? 'bg-slate-50/30 hover:bg-blue-50/40'
                        : 'bg-white hover:bg-blue-50/40'
                    }`}
                  >
                    {/* VP Address (Blue Theme - Left Margin Blue) */}
                    <td className="py-2 px-2.5 align-middle border-l-4 border-l-blue-500 border-r border-slate-100">
                      {/* Screen assignment dropdown */}
                      <div className="mb-1 flex items-center gap-1">
                        <select
                          value={boundScreens[0]?.id || ''}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '__CREATE_NEW__') {
                              handleOpenCreateScreenForParam(param);
                            } else {
                              handleScreenChangeForVp(param, val);
                            }
                          }}
                          className="text-[11px] font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer w-full max-w-[135px] truncate shadow-2xs"
                          title="Change assigned screen for this VP address"
                        >
                          <option value="">-- No Screen --</option>
                          {project.screens.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name} (#{s.screenNumber})
                            </option>
                          ))}
                          <option value="__CREATE_NEW__">+ Create Screen...</option>
                        </select>

                        {boundScreens[0] && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedScreenId(boundScreens[0].id);
                              setActiveTab('screens');
                            }}
                            className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors shrink-0"
                            title={`Jump to screen: ${boundScreens[0].name}`}
                          >
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1 font-mono">
                        {inlineEditingVpParamId === param.id ? (
                          <div className="flex items-center gap-1 py-0.5">
                            <input
                              type="text"
                              autoFocus
                              value={inlineEditingVpHex}
                              onChange={e => setInlineEditingVpHex(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveInlineVp(param);
                                } else if (e.key === 'Escape') {
                                  handleCancelInlineVpEdit();
                                }
                              }}
                              onBlur={() => handleSaveInlineVp(param)}
                              className="w-16 px-1.5 py-0.5 font-mono font-bold text-xs text-blue-950 bg-white border-2 border-blue-500 rounded shadow-xs focus:outline-none text-center"
                              placeholder="0x1000"
                            />
                            <button
                              type="button"
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => handleSaveInlineVp(param)}
                              className="p-1 rounded bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition-colors shrink-0 cursor-pointer"
                              title="Save VP Address (Enter)"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onMouseDown={e => e.preventDefault()}
                              onClick={handleCancelInlineVpEdit}
                              className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors shrink-0 cursor-pointer"
                              title="Cancel (Esc)"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span 
                            onDoubleClick={() => handleStartInlineVpEdit(param)}
                            className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-blue-100/80 text-blue-800 border border-blue-300/70 shadow-2xs cursor-pointer hover:bg-blue-200/80 hover:border-blue-400 transition-all inline-flex items-center gap-1 group"
                            title="Double-click to change VP address inline (no modal)"
                          >
                            <span>{formatVpHex(param.vpAddress)}</span>
                            <Edit3 className="w-2.5 h-2.5 text-blue-400 group-hover:text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </span>
                        )}
                        {param.words > 1 && (
                          <span className="text-[10px] text-blue-600 font-mono truncate">
                            ..{formatVpHex(param.vpAddress + param.words - 1)}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {param.words} {param.words === 1 ? 'word' : 'words'} ({param.words * 2}B)
                      </div>
                      {conflict && (
                        <div className="flex items-center gap-1 text-[10px] text-amber-600 font-medium mt-0.5">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[130px]" title={conflict}>{conflict}</span>
                        </div>
                      )}
                    </td>

                    {/* Name & Key (Amber Theme - Left Margin Amber) */}
                    <td className="py-2 px-2.5 align-middle border-l-4 border-l-amber-500 border-r border-slate-100">
                      {inlineEditingParamId === param.id ? (
                        <div className="flex items-center gap-1 py-0.5">
                          <input
                            type="text"
                            autoFocus
                            value={inlineEditingName}
                            onChange={e => setInlineEditingName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveInlineName(param.id);
                              } else if (e.key === 'Escape') {
                                handleCancelInlineEdit();
                              }
                            }}
                            onBlur={() => handleSaveInlineName(param.id)}
                            className="px-2 py-0.5 text-xs font-semibold text-slate-900 bg-white border-2 border-amber-500 rounded shadow-xs focus:outline-none w-full min-w-[110px]"
                            placeholder="Parameter name..."
                          />
                          <button
                            type="button"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => handleSaveInlineName(param.id)}
                            className="p-1 rounded bg-amber-600 hover:bg-amber-700 text-white shadow-2xs transition-colors shrink-0 cursor-pointer"
                            title="Save Name (Enter)"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onMouseDown={e => e.preventDefault()}
                            onClick={handleCancelInlineEdit}
                            className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors shrink-0 cursor-pointer"
                            title="Cancel (Esc)"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div
                          onDoubleClick={() => handleStartInlineEdit(param)}
                          className="font-semibold text-slate-900 hover:text-amber-800 cursor-pointer group flex items-center gap-1 transition-colors py-0.5 rounded px-1 -mx-1 hover:bg-amber-50/70"
                          title="Double-click to edit name inline (no modal)"
                        >
                          <span className="break-words line-clamp-1">{param.name}</span>
                          <Edit3 className="w-2.5 h-2.5 text-slate-300 group-hover:text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </div>
                      )}
                      <div className="font-mono text-[10px] text-slate-500 truncate">
                        {param.identifier}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={`inline-block text-[9px] font-medium px-1.5 py-0.2 rounded border truncate ${getGroupBadgeClass(param.group)}`}>
                          {param.group}
                        </span>
                      </div>
                    </td>

                    {/* Column 3: Unit & Scaling Dropdown Selectors (Cyan Theme - Left Margin Cyan) */}
                    <td className="py-2 px-2.5 align-middle border-l-4 border-l-cyan-500 border-r border-slate-100">
                      <div className="flex flex-col gap-1 w-full max-w-[130px]">
                        {/* Dropdown for Unit */}
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold text-cyan-900 w-8 shrink-0">Unit:</span>
                          <select
                            value={param.unit || 'Unitless'}
                            onChange={e => {
                              const val = e.target.value === 'Unitless' ? '' : e.target.value;
                              updateParameter(param.id, { unit: val });
                            }}
                            className="w-full text-[11px] font-semibold text-slate-800 bg-white hover:bg-cyan-50/60 border border-cyan-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-cyan-500 shadow-2xs cursor-pointer truncate"
                            title="Select engineering unit for this particular VP"
                          >
                            {param.unit && !STANDARD_UNITS.includes(param.unit) && (
                              <option value={param.unit}>{param.unit} (Current)</option>
                            )}
                            {STANDARD_UNITS.map(u => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Dropdown for Scaling */}
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold text-cyan-900 w-8 shrink-0">Scale:</span>
                          <select
                            value={param.scale || 1}
                            onChange={e => {
                              updateParameter(param.id, { scale: Number(e.target.value) || 1 });
                            }}
                            className="w-full text-[11px] font-mono font-medium text-slate-800 bg-white hover:bg-cyan-50/60 border border-cyan-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-cyan-500 shadow-2xs cursor-pointer truncate"
                            title="Select scale factor (1 = 1:1, 10 = 0.1 res)"
                          >
                            {SCALE_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                            {!SCALE_OPTIONS.some(opt => opt.value === param.scale) && (
                              <option value={param.scale}>1/{param.scale} (Custom)</option>
                            )}
                          </select>
                        </div>
                      </div>
                    </td>

                    {/* Column 4: Data Type Dropdown Selector (Indigo Theme - Left Margin Indigo) */}
                    <td className="py-2 px-2.5 align-middle border-l-4 border-l-indigo-500 border-r border-slate-100">
                      <div className="flex flex-col gap-1 w-full max-w-[130px]">
                        <select
                          value={param.dataType}
                          onChange={e => {
                            const newType = e.target.value as DwinDataType;
                            let newWords = 1;
                            if (newType === 'UINT32' || newType === 'INT32' || newType === 'FLOAT32') {
                              newWords = 2;
                            } else if (newType === 'STRING') {
                              newWords = Math.max(2, param.words || 2);
                            } else {
                              newWords = 1;
                            }
                            let nextVal = param.defaultValue;
                            if (newType === 'UINT16' || newType === 'INT16' || newType === 'BITFIELD') {
                              const n = typeof nextVal === 'number' ? nextVal : parseInt(String(nextVal), 10);
                              if (isNaN(n) || n > 65535 || n < -32768) {
                                nextVal = 0;
                              }
                            } else if (newType === 'UINT8' || newType === 'INT8') {
                              const n = typeof nextVal === 'number' ? nextVal : parseInt(String(nextVal), 10);
                              if (isNaN(n) || n > 255 || n < -128) {
                                nextVal = 0;
                              }
                            }
                            updateParameter(param.id, {
                              dataType: newType,
                              words: newWords,
                              defaultValue: nextVal
                            });
                          }}
                          className="w-full text-[11px] font-mono font-bold text-indigo-950 bg-white hover:bg-indigo-50/60 border border-indigo-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs cursor-pointer"
                          title="Select data type for this particular VP (changes word count and zero digits)"
                        >
                          {DATA_TYPE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center justify-between text-[9px] text-indigo-700 font-mono px-0.5">
                          <span>{param.words} {param.words === 1 ? 'wd' : 'wds'} ({param.words * 2}B)</span>
                          <span className="font-semibold px-1 py-0.2 rounded bg-indigo-50 border border-indigo-200">
                            {param.dataType === 'UINT8' || param.dataType === 'INT8' ? '2-digit' : param.dataType === 'UINT32' || param.dataType === 'INT32' || param.dataType === 'FLOAT32' ? '8-digit' : '4-digit'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Column 5: Value Column (Emerald Theme - UART Zero Digits or Equivalent Hex Value) */}
                    <td className="py-2 px-2.5 align-middle whitespace-nowrap border-l-4 border-l-emerald-500 border-r border-slate-100">
                      {(() => {
                        const valInfo = formatParamValue(param);
                        return (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1 font-mono">
                              {inlineEditingValParamId === param.id ? (
                                <div className="flex items-center gap-1 py-0.5">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={inlineEditingValStr}
                                    onChange={e => setInlineEditingValStr(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSaveInlineVal(param);
                                      } else if (e.key === 'Escape') {
                                        handleCancelInlineValEdit();
                                      }
                                    }}
                                    onBlur={() => handleSaveInlineVal(param)}
                                    className="w-16 px-1.5 py-0.5 font-mono font-bold text-xs text-emerald-950 bg-white border-2 border-emerald-500 rounded shadow-xs focus:outline-none text-center"
                                    placeholder="0"
                                  />
                                  <button
                                    type="button"
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => handleSaveInlineVal(param)}
                                    className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors shrink-0 cursor-pointer"
                                    title="Save Value (Enter)"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={handleCancelInlineValEdit}
                                    className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors shrink-0 cursor-pointer"
                                    title="Cancel (Esc)"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <span
                                    onDoubleClick={() => handleStartInlineValEdit(param)}
                                    className="inline-flex items-center gap-0.5 font-mono font-bold text-[11px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-950 border border-emerald-300 shadow-2xs cursor-pointer hover:bg-emerald-100 hover:border-emerald-400 transition-all group"
                                    title="Double-click to set value or 0000"
                                  >
                                    <span className="text-emerald-500 font-semibold select-none">0x</span>
                                    <span className="tracking-wider">{valInfo.displayHex}</span>
                                    <Edit3 className="w-2.5 h-2.5 text-emerald-400 group-hover:text-emerald-700 opacity-0 group-hover:opacity-100 transition-opacity ml-0.5" />
                                  </span>
                                  {param.unit && (
                                    <span className="text-[10px] text-slate-600 font-sans font-medium truncate max-w-[40px]">{param.unit}</span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[9px] font-mono text-slate-400">
                              <span>UART:</span>
                              <span className="text-emerald-800 font-bold bg-emerald-50/80 px-1 py-0.2 rounded border border-emerald-200 truncate">
                                {valInfo.rawZeros}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </td>

                    {/* Role & DWIN Command (Violet Theme - Left Margin Violet) */}
                    <td className="py-2 px-2.5 align-middle whitespace-nowrap border-l-4 border-l-violet-500 border-r border-slate-100">
                      <div className="flex flex-col gap-1 items-start">
                        <span className={`inline-flex items-center font-mono text-[10px] px-2 py-0.2 rounded border font-medium ${getRoleBadgeClass(param.role)}`}>
                          {formatRoleLabel(param.role)}
                        </span>
                        <span 
                          className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-violet-50 text-violet-800 border border-violet-200 font-bold"
                          title={`DWIN Command: ${param.role === 'read_only' ? '0x83 (Read VP)' : param.role === 'write_only' ? '0x82 (Write VP)' : '0x82 (Write VP) / 0x83 (Read VP)'}`}
                        >
                          {getRoleCommandBadge(param.role)}
                        </span>
                      </div>
                    </td>

                    {/* Actions & HEX Lab (Slate Theme - Left Margin Slate) */}
                    <td className="py-2 px-2.5 align-middle text-right whitespace-nowrap border-l-4 border-l-slate-400">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => jumpToHexLabWithParam(param)}
                          className="px-2 py-1 text-[11px] text-blue-700 hover:text-blue-900 border border-blue-200 bg-blue-50/70 rounded hover:bg-blue-100 flex items-center gap-1 font-medium transition-colors"
                          title="Generate or Test HEX Frame for this Parameter"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                          <span>HEX Lab</span>
                        </button>
                        <button
                          onClick={() => handleOpenEdit(param)}
                          className="p-1 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100 transition-colors"
                          title="Edit Parameter"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => duplicateParameter(param.id)}
                          className="p-1 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100 transition-colors"
                          title="Duplicate Parameter"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => {
                            deleteParameter(param.id);
                          }}
                          className="p-1 text-red-500 hover:text-red-700 rounded hover:bg-red-50 transition-colors"
                          title="Delete Parameter"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Second line: Hex Value frame preview */}
                      <div className="flex items-center justify-end mt-1.5">
                        <div
                          onClick={() => jumpToHexLabWithParam(param)}
                          className="inline-flex items-center gap-1.5 font-mono text-xs text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded cursor-pointer transition-colors shadow-2xs font-semibold"
                          title={`Click to load into HEX Lab: ${getQuickHexPreview(param, project.headerHex)}`}
                        >
                          <span className="text-[10px] text-slate-400 font-sans uppercase font-medium">HEX:</span>
                          <span style={{ fontSize: '14px' }} className="text-[14px] font-mono tracking-wide">
                            {getQuickHexPreview(param, project.headerHex)}
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredParameters.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-slate-500">
                    No parameters match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Parameter Edit / Add Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-3xl w-full p-6 sm:p-8 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editingParam ? `Edit Parameter: ${editingParam.name}` : 'Define New DGUS Parameter'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Parameter Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Target Temperature"
                    value={name}
                    onChange={e => {
                      setName(e.target.value);
                      if (!identifier || identifier.startsWith('PARAM_')) {
                        setIdentifier(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '_'));
                      }
                    }}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1 font-mono">
                    Identifier (C Macro / Key)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CMD_TARGET_TEMP"
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value.toUpperCase())}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 bg-slate-50 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-700 font-medium mb-1 font-mono">
                    VP Address (Hex)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="0x1000"
                    value={vpHexInput}
                    onChange={e => setVpHexInput(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 bg-slate-50 text-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Data Type
                  </label>
                  <select
                    value={dataType}
                    onChange={e => handleDataTypeChange(e.target.value as DwinDataType)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 bg-slate-50 text-slate-900 font-mono"
                  >
                    <option value="UINT16">UINT16 (1 word / 2 bytes)</option>
                    <option value="INT16">INT16 (Signed 1 word)</option>
                    <option value="UINT32">UINT32 (2 words / 4 bytes)</option>
                    <option value="INT32">INT32 (Signed 2 words)</option>
                    <option value="FLOAT32">FLOAT32 (IEEE-754 4 bytes)</option>
                    <option value="STRING">STRING (ASCII/GBK variable)</option>
                    <option value="BITFIELD">BITFIELD (16-bit status mask)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1 font-mono">
                    Words Allocated
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="64"
                    value={words}
                    onChange={e => setWords(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 bg-slate-50 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Engineering Unit
                  </label>
                  <input
                    type="text"
                    placeholder="°C, RPM, bar, ms, %, etc."
                    value={unit}
                    onChange={e => setUnit(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Scale Factor (1 = 1:1, 10 = 0.1 res)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={scale}
                    onChange={e => setScale(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 bg-slate-50 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-700 font-medium mb-1 font-mono">
                    Minimum Allowed
                  </label>
                  <input
                    type="number"
                    value={minVal}
                    onChange={e => setMinVal(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 bg-slate-50 text-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1 font-mono">
                    Maximum Allowed
                  </label>
                  <input
                    type="number"
                    value={maxVal}
                    onChange={e => setMaxVal(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 bg-slate-50 text-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1 font-mono">
                    Default Initial Value
                  </label>
                  <input
                    type="text"
                    value={defaultVal}
                    onChange={e => setDefaultVal(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 bg-slate-50 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    VP Role
                  </label>
                  <select
                    value={role}
                    onChange={e => setRole(e.target.value as VpRole)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 bg-slate-50 text-slate-900"
                  >
                    <option value="read_write">Read &amp; Write (Setpoint / Interactive)</option>
                    <option value="read_only">Read Telemetry (Sensor / Calculated)</option>
                    <option value="write_only">Write Pulse / Command</option>
                    <option value="system_reg">DWIN System Register (0x0000 - 0x00FF)</option>
                    <option value="touch_return">Touch Return Keycode / Keypad buffer</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Group / Subsystem
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Thermal Loop, Motion, Pneumatics"
                    value={group}
                    onChange={e => setGroup(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Description &amp; Embedded Implementation Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Detail protocol word alignment, calibration, or DGUS config notes..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-slate-300 bg-slate-50 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded bg-blue-600 text-white font-medium hover:bg-blue-700"
                >
                  {editingParam ? 'Save Changes' : 'Create Parameter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* Add VP for Selected Screen Modal */}
      {isAddVpForScreenModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-2xl w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Add New VP Address for Screen
                  </h3>
                  <p className="text-xs text-slate-500">
                    Define a new variable pointer and bind it directly to the target screen.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddVpForScreenModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAddVpForScreen} className="space-y-3.5 text-xs">
              {/* Target Screen selector + create new */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Assign To Screen
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={targetScreenForAddVp}
                    onChange={e => setTargetScreenForAddVp(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded border border-slate-300 bg-white font-semibold text-slate-900"
                  >
                    {project.screens.map(s => (
                      <option key={s.id} value={s.id}>
                        Screen #{s.screenNumber} - {s.name} ({s.group})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleOpenCreateScreenForParam()}
                    className="px-2.5 py-1.5 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 font-medium whitespace-nowrap cursor-pointer transition-colors shadow-2xs"
                  >
                    + New Screen
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Parameter Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Tank Pressure"
                    value={newVpName}
                    onChange={e => {
                      setNewVpName(e.target.value);
                      if (!newVpIdentifier) {
                        setNewVpIdentifier(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '_'));
                      }
                    }}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1 font-mono">
                    VP Address (Hex)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="0x1050"
                    value={newVpHex}
                    onChange={e => setNewVpHex(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-blue-400 bg-blue-50/50 font-mono font-bold text-blue-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Data Type
                  </label>
                  <select
                    value={newVpDataType}
                    onChange={e => {
                      const dt = e.target.value as DwinDataType;
                      setNewVpDataType(dt);
                      if (dt === 'UINT32' || dt === 'INT32' || dt === 'FLOAT32') {
                        setNewVpWords(2);
                      } else {
                        setNewVpWords(1);
                      }
                    }}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white"
                  >
                    <option value="UINT16">UINT16 (16-bit Unsigned)</option>
                    <option value="INT16">INT16 (16-bit Signed)</option>
                    <option value="UINT32">UINT32 (32-bit Unsigned)</option>
                    <option value="INT32">INT32 (32-bit Signed)</option>
                    <option value="FLOAT32">FLOAT32 (32-bit Float)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Unit
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. PSI, bar, °C, RPM"
                    value={newVpUnit}
                    onChange={e => setNewVpUnit(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Role
                  </label>
                  <select
                    value={newVpRole}
                    onChange={e => setNewVpRole(e.target.value as VpRole)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white"
                  >
                    <option value="read_write">Read / Write (0x82 / 0x83)</option>
                    <option value="read_only">Read Only (0x83)</option>
                    <option value="write_only">Write Only (0x82)</option>
                    <option value="touch_return">Touch Jump / Keycode (0x84)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Min Value
                  </label>
                  <input
                    type="number"
                    value={newVpMin}
                    onChange={e => setNewVpMin(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Max Value
                  </label>
                  <input
                    type="number"
                    value={newVpMax}
                    onChange={e => setNewVpMax(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Default Initial
                  </label>
                  <input
                    type="text"
                    value={newVpDefault}
                    onChange={e => setNewVpDefault(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddVpForScreenModalOpen(false)}
                  className="px-3.5 py-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 shadow-xs"
                >
                  Add VP &amp; Bind to Screen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Add VPs for Selected Screen Modal */}
      {isBatchVpModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full p-6 sm:p-7 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-2xs">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Batch Add VPs for Screen
                  </h3>
                  <p className="text-xs text-slate-500">
                    Directly customize and generate sequential VP addresses and register them to your selected screen.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBatchVpModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {batchSuccessMsg && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold text-xs flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{batchSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleExecuteBatchVpForScreen} className="space-y-4 text-xs">
              {/* Target screen selector & Sequence start controls */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 items-start">
                {/* Column 1: Target Screen */}
                <div className="flex flex-col">
                  <div className="flex items-center justify-between h-5 mb-1">
                    <label className="block text-slate-700 font-semibold">
                      Target Screen
                    </label>
                  </div>
                  <div className="flex items-center gap-2 h-9">
                    <select
                      value={batchTargetScreenId}
                      onChange={e => setBatchTargetScreenId(e.target.value)}
                      style={{ width: '150px' }}
                      className="w-[150px] shrink-0 h-full px-3 rounded-lg border border-slate-300 bg-white font-semibold text-slate-900 shadow-2xs text-xs"
                    >
                      {project.screens.map(s => (
                        <option key={s.id} value={s.id}>
                          Screen #{s.screenNumber} - {s.name} ({s.group})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleOpenCreateScreenForParam()}
                      className="h-full px-3 rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400 font-semibold whitespace-nowrap text-xs transition-all shadow-2xs cursor-pointer active:scale-95"
                    >
                      + New Screen
                    </button>
                  </div>
                  <div className="h-4 mt-1 flex items-center">
                    <span className="text-[10px] text-slate-400">Target screen for VP bindings</span>
                  </div>
                </div>

                {/* Column 2: Start VP Address */}
                <div className="flex flex-col">
                  <div className="flex items-center justify-between h-5 mb-1">
                    <label className="block text-slate-700 font-semibold font-mono">
                      Start VP Address (Hex)
                    </label>
                    <button
                      type="button"
                      onClick={handleAutoSequenceReset}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 font-mono font-bold hover:underline"
                      title="Auto-detect next sequential free VP address"
                    >
                      Next: {formatVpHex(getNextAvailableVp())}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 h-9">
                    <input
                      type="text"
                      required
                      value={batchVpStartHex}
                      onChange={e => handleStartHexChange(e.target.value)}
                      placeholder={formatVpHex(getNextAvailableVp())}
                      style={{ width: '141px', fontSize: '14px' }}
                      className="w-[141px] shrink-0 h-full px-3 rounded-lg border border-indigo-300 bg-indigo-50/50 font-mono font-bold text-indigo-950 text-[14px] shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={handleAutoSequenceReset}
                      className="h-full px-2.5 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-mono font-bold text-[11px] border border-indigo-300 whitespace-nowrap transition-colors"
                      title="Allocate next free sequence address"
                    >
                      Auto Sequence
                    </button>
                  </div>
                  <div className="h-4 mt-1 flex items-center">
                    {(() => {
                      const rawDigits = batchVpStartHex.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
                      const effAddr = getEffectiveBatchStartAddr(batchVpStartHex);
                      const occupiedBy = project.parameters.find(p => p.vpAddress === effAddr);
                      if (rawDigits.length === 0) {
                        return (
                          <span className="text-[10px] text-amber-700 font-medium flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>No numbers in input. Allocated: {formatVpHex(effAddr)}.</span>
                          </span>
                        );
                      }
                      if (occupiedBy) {
                        return (
                          <span className="text-[10px] text-amber-700 font-medium flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>{formatVpHex(effAddr)} in use ({occupiedBy.name}). Next: {formatVpHex(getNextAvailableVp())}</span>
                          </span>
                        );
                      }
                      return (
                        <span className="text-[10px] text-emerald-600 font-medium font-mono">
                          Sequence starts at {formatVpHex(effAddr)}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Column 3: Number of VPs */}
                <div className="flex flex-col">
                  <div className="flex items-center justify-between h-5 mb-1">
                    <label className="block text-slate-700 font-semibold">
                      Number of VPs
                    </label>
                  </div>
                  <div className="h-9">
                    <input
                      type="number"
                      min="1"
                      max="20"
                      required
                      value={batchVpCount}
                      onChange={e => handleBatchCountChange(parseInt(e.target.value) || 1)}
                      style={{ width: '80px' }}
                      className="w-[80px] h-full px-3 rounded-lg border border-slate-300 font-mono font-bold text-slate-900 text-center shadow-2xs text-xs"
                    />
                  </div>
                  <div className="h-4 mt-1 flex items-center">
                    <span className="text-[10px] text-slate-400">1 to 20 sequential VPs</span>
                  </div>
                </div>
              </div>

              {/* Continuous Sequence Allocation Section with Direct Edit Columns */}
              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 space-y-3 shadow-inner">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-900 font-bold text-xs uppercase tracking-wider">
                      Continuous Sequence Allocation
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-mono font-bold text-[10px]">
                      {batchItems.length} VPs
                    </span>
                  </div>

                  <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 hover:text-slate-900 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={simulate1190Occupied}
                      onChange={e => {
                        setSimulate1190Occupied(e.target.checked);
                        setTimeout(() => handleStartHexChange(batchVpStartHex), 50);
                      }}
                      className="rounded text-indigo-600 focus:ring-0 w-3.5 h-3.5"
                    />
                    <span className="font-medium">Simulate 1190 in use &rarr; Jump 1200</span>
                  </label>
                </div>

                {/* Direct Edit Table Column View */}
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-2xs max-h-72">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 text-[11px] uppercase tracking-wide">
                        <th className="py-2 px-3 w-12 text-center">#</th>
                        <th className="py-2 px-3">Parameter Name</th>
                        <th className="py-2 px-3 w-36 font-mono">VP Address (Hex)</th>
                        <th className="py-2 px-3 w-40 font-mono">Data Type</th>
                        <th className="py-2 px-3 w-40">Read / Write Role</th>
                        <th className="py-2 px-3 w-20 text-center">Cmd</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {batchItems.map((item, i) => {
                        const cleanHex = item.vpAddressHex.trim().replace(/^0x/i, '');
                        const parsedAddr = parseInt(cleanHex, 16);
                        const wordSize = (item.dataType === 'UINT32' || item.dataType === 'INT32' || item.dataType === 'FLOAT32') ? 2 : 1;
                        const occupied = !isNaN(parsedAddr) && isVpOccupied(parsedAddr, wordSize);

                        return (
                          <tr
                            key={item.id || i}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              occupied ? 'bg-amber-50/50' : ''
                            }`}
                          >
                            <td className="py-2 px-3 text-center font-mono font-bold text-slate-400 text-[11px]">
                              #{i + 1}
                            </td>

                            {/* Direct edit: Parameter Name */}
                            <td className="py-1.5 px-3">
                              <input
                                type="text"
                                required
                                value={item.name}
                                onChange={e => handleUpdateBatchItem(i, 'name', e.target.value)}
                                placeholder={`Parameter ${i + 1}`}
                                className="w-full px-2.5 py-1 rounded border border-slate-300 focus:border-indigo-500 bg-white font-semibold text-slate-900 text-xs shadow-2xs"
                              />
                            </td>

                            {/* Direct edit: VP Address (Hex) */}
                            <td className="py-1.5 px-3">
                              <div className="relative flex items-center">
                                <input
                                  type="text"
                                  required
                                  value={item.vpAddressHex}
                                  onChange={e => handleUpdateBatchItem(i, 'vpAddressHex', e.target.value)}
                                  placeholder="0x1190"
                                  style={{ fontSize: '14px' }}
                                  className={`w-full px-2.5 py-1 rounded border font-mono font-bold text-[14px] shadow-2xs ${
                                    occupied
                                      ? 'border-amber-400 bg-amber-50 text-amber-950'
                                      : 'border-indigo-300 bg-indigo-50/40 text-indigo-950'
                                  }`}
                                />
                                {occupied && (
                                  <span title="Address occupied by existing parameter or binding" className="absolute right-2 flex items-center pointer-events-none">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Direct edit: Data Type */}
                            <td className="py-1.5 px-3">
                              <select
                                value={item.dataType}
                                onChange={e => handleUpdateBatchItem(i, 'dataType', e.target.value as DwinDataType)}
                                className="w-full px-2 py-1 rounded border border-slate-300 bg-white font-mono text-xs text-slate-900 font-semibold shadow-2xs"
                              >
                                <option value="UINT16">UINT16 (16-bit)</option>
                                <option value="INT16">INT16 (Signed)</option>
                                <option value="UINT32">UINT32 (32-bit)</option>
                                <option value="INT32">INT32 (Signed 32)</option>
                                <option value="FLOAT32">FLOAT32 (Float)</option>
                                <option value="BITFIELD">BITFIELD (Mask)</option>
                              </select>
                            </td>

                            {/* Direct edit: Read / Write Role */}
                            <td className="py-1.5 px-3">
                              <select
                                value={item.role}
                                onChange={e => handleUpdateBatchItem(i, 'role', e.target.value as VpRole)}
                                className="w-full px-2 py-1 rounded border border-slate-300 bg-white text-xs text-slate-900 font-medium shadow-2xs"
                              >
                                <option value="read_write">Read / Write</option>
                                <option value="read_only">Read Only</option>
                                <option value="write_only">Write Only</option>
                                <option value="touch_return">Touch Return</option>
                              </select>
                            </td>

                            {/* Live Badge: DWIN Command */}
                            <td className="py-2 px-3 text-center">
                              <span className="inline-block px-2 py-0.5 rounded bg-violet-100 text-violet-800 font-mono text-[10px] font-bold border border-violet-200">
                                {getRoleCommandBadge(item.role)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsBatchVpModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 font-medium text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 shadow-sm flex items-center gap-1.5 text-xs transition-colors"
                >
                  <Layers className="w-4 h-4" />
                  <span>Generate &amp; Register {batchItems.length} VPs</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Create Screen Modal (Secondary / Child Modal with high z-index z-[70] so it always sits visibly in front of parent modals) */}
      {isQuickCreateScreenModalOpen && (
        <div 
          className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsQuickCreateScreenModalOpen(false);
              setQuickCreateParamToBind(null);
            }
          }}
        >
          <div 
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 relative z-10 animate-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-create-screen-title"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-2xs">
                  <Monitor className="w-4 h-4" />
                </div>
                <h3 id="quick-create-screen-title" className="text-base font-bold text-slate-900">
                  Create New Screen
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsQuickCreateScreenModalOpen(false);
                  setQuickCreateParamToBind(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickCreateScreen} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Screen / Pic Number (#)
                </label>
                <input
                  type="number"
                  min="0"
                  max="65535"
                  required
                  value={newScreenNumber}
                  onChange={e => setNewScreenNumber(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono font-bold text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Screen Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alarm History, Motor Control"
                  value={newScreenName}
                  onChange={e => setNewScreenName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-semibold text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Subsystem / Group
                </label>
                <input
                  type="text"
                  placeholder="e.g. Operator UI, Setup, Diagnostics"
                  value={newScreenGroup}
                  onChange={e => setNewScreenGroup(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                />
              </div>

              {quickCreateParamToBind && (
                <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-medium flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 shrink-0 text-blue-600" />
                  <span>Will immediately assign parameter <strong>{quickCreateParamToBind.name}</strong> ({formatVpHex(quickCreateParamToBind.vpAddress)}) to this new screen.</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsQuickCreateScreenModalOpen(false);
                    setQuickCreateParamToBind(null);
                  }}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shadow-2xs cursor-pointer"
                >
                  Create Screen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
