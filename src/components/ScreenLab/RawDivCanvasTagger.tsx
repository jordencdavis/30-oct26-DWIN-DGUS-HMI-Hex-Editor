/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useDwin } from '../../context/DwinContext';
import { DwinDataType, ScreenVpUsageRole, Parameter, ScreenVpBinding, Screen } from '../../types/dwin';
import {
  Upload, FileText, CheckCircle2, AlertCircle, Sparkles, Tag,
  Layers, Cpu, LayoutGrid, Eye, ArrowRight, Download, RefreshCw,
  Move, Plus, Trash2, Edit3, Check, Sliders, Hash, Info, Maximize2,
  ZoomIn, ZoomOut, RotateCcw, Copy
} from 'lucide-react';
import industrialDashboardImg from '../../assets/images/dwin_hmi_industrial_dashboard_1793218798770.jpg';
import blueprintPanelImg from '../../assets/images/dwin_hmi_blueprint_panel_1793218820640.jpg';

export interface ParsedDivItem {
  id: string;
  rawText: string;
  rawHtml?: string;
  extractedLabel: string;
  extractedValue: string;
  inferredUnit: string;
  x: number;
  y: number;
  width: number;
  height: number;
  
  // Tagging & Assignment
  isTagged: boolean;
  taggedParamName: string;
  taggedIdentifier: string;
  assignedVpAddress: number;
  dataType: DwinDataType;
  unit: string;
  scale: number;
  min: number;
  max: number;
  role: ScreenVpUsageRole;
  targetScreenId: string; // existing screen id or 'new'
  newScreenNumber?: number;
  newScreenName?: string;
  description: string;
}

const SAMPLE_PRESETS: { [key: string]: { title: string; desc: string; text: string } } = {
  hvac: {
    title: 'HVAC Chiller DIV Dump',
    desc: 'HTML div elements with styles, values, and units for a commercial chiller plant',
    text: `<div id="chiller-1-status" class="status-indicator" style="position: absolute; left: 80px; top: 100px; width: 160px; height: 50px;">
  <span class="label">Chiller State</span>
  <span class="val">RUNNING</span>
</div>

<div id="temp-supply" class="metric-box" style="position: absolute; left: 280px; top: 100px; width: 180px; height: 60px;">
  <div class="title">Supply Water Temp</div>
  <div class="value">7.2 °C</div>
</div>

<div id="temp-return" class="metric-box" style="position: absolute; left: 500px; top: 100px; width: 180px; height: 60px;">
  <div class="title">Return Water Temp</div>
  <div class="value">12.8 °C</div>
</div>

<div id="evap-pressure" class="gauge-div" style="position: absolute; left: 80px; top: 220px; width: 180px; height: 60px;">
  <span class="label">Evaporator Pressure</span>
  <span class="val">3.45 bar</span>
</div>

<div id="pump-flow-rate" class="flow-pill" style="position: absolute; left: 280px; top: 220px; width: 180px; height: 60px;">
  <span class="lbl">Primary Flow Rate</span>
  <span class="num">185.0 L/min</span>
</div>

<div id="comp-current" class="amp-box" style="position: absolute; left: 500px; top: 220px; width: 180px; height: 60px;">
  <label>Compressor Current</label>
  <div class="reading">28.4 A</div>
</div>`
  },
  motor: {
    title: 'VFD Motor Inverter DIVs',
    desc: 'Motor drive telemetry divs with RPM, bus voltage, power, and frequency',
    text: `<div class="vfd-telemetry" style="left: 60px; top: 90px; width: 200px; height: 55px;">
  Motor Speed: 1485 RPM
</div>

<div class="vfd-telemetry" style="left: 290px; top: 90px; width: 200px; height: 55px;">
  DC Bus Voltage: 564 V
</div>

<div class="vfd-telemetry" style="left: 520px; top: 90px; width: 200px; height: 55px;">
  Output Frequency: 49.8 Hz
</div>

<div class="vfd-telemetry" style="left: 60px; top: 210px; width: 200px; height: 55px;">
  Drive Torque: 82.5 %
</div>

<div class="vfd-telemetry" style="left: 290px; top: 210px; width: 200px; height: 55px;">
  Heatsink Temp: 54.0 °C
</div>

<div class="vfd-telemetry" style="left: 520px; top: 210px; width: 200px; height: 55px;">
  Total Energy: 1240 kWh
</div>`
  },
  keyvalue: {
    title: 'Key-Value / Coordinates Dump',
    desc: 'Tabular / semi-structured div coordinates and values from logging or CAD',
    text: `div#setpoint_temp { left: 100px, top: 120px, width: 150px, height: 45px } => Target Temp: 23.5 °C
div#room_humidity { left: 300px, top: 120px, width: 150px, height: 45px } => Humidity: 48.2 %
div#co2_ppm { left: 500px, top: 120px, width: 150px, height: 45px } => CO2 Level: 640 ppm
div#fan_speed { left: 100px, top: 240px, width: 150px, height: 45px } => Blower Speed: 75 %
div#filter_dp { left: 300px, top: 240px, width: 150px, height: 45px } => Filter Delta-P: 120 Pa
div#system_alarm { left: 500px, top: 240px, width: 150px, height: 45px } => Alarm Status: 0x0000`
  }
};

export const RawDivCanvasTagger: React.FC = () => {
  const { project, addScreen, updateScreen, addParameter, setActiveTab, setSelectedScreenId } = useDwin();

  // Screen resolution parse
  const screenDimensions = useMemo(() => {
    const parts = (project.resolution || '800x480').toLowerCase().split('x');
    const width = parseInt(parts[0], 10) || 800;
    const height = parseInt(parts[1], 10) || 480;
    return { width, height };
  }, [project.resolution]);

  // Safe base VP generator
  const getSafeNextVp = (offset = 0): number => {
    let highest = 0x1000;
    project.parameters.forEach(p => {
      if (p.vpAddress > highest) highest = p.vpAddress;
    });
    project.screens.forEach(s => {
      s.vpBindings.forEach(b => {
        if (b.vpAddress > highest) highest = b.vpAddress;
      });
    });
    const base = Math.max(0x1100, Math.ceil((highest + 2) / 2) * 2);
    return base + (offset * 2);
  };

  const formatVpHex = (addr: number): string => {
    return '0x' + (addr || 0).toString(16).padStart(4, '0').toUpperCase();
  };

  const parseHexOrDec = (str: string, fallback: number): number => {
    const clean = str.trim();
    if (!clean) return fallback;
    let val: number;
    if (clean.toLowerCase().startsWith('0x')) {
      val = parseInt(clean.substring(2), 16);
    } else {
      val = parseInt(clean, 10);
    }
    return isNaN(val) || val < 0 || val > 0xFFFF ? fallback : val;
  };

  // Storage key for persistent user uploads across tab switching & reloads
  const RAW_DIV_TAGGER_STORAGE_KEY = 'dwin_raw_div_tagger_state_v2';

  // Persistent state
  const [rawText, setRawText] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(RAW_DIV_TAGGER_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.rawText === 'string') {
          return parsed.rawText;
        }
      }
    } catch {
      // ignore
    }
    return SAMPLE_PRESETS.hvac.text;
  });

  const [parsedItems, setParsedItems] = useState<ParsedDivItem[]>(() => {
    try {
      const saved = localStorage.getItem(RAW_DIV_TAGGER_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.parsedItems) && parsed.parsedItems.length > 0) {
          return parsed.parsedItems;
        }
      }
    } catch {
      // ignore
    }
    return [];
  });

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [canvasZoom, setCanvasZoom] = useState<number>(0.9);
  const [canvasBg, setCanvasBg] = useState<'blueprint' | 'dashboard' | 'grid_dark' | 'grid_light'>('blueprint');
  const [viewMode, setViewMode] = useState<'canvas' | 'split' | 'table'>('split');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);

  // Sync state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(RAW_DIV_TAGGER_STORAGE_KEY, JSON.stringify({
        rawText,
        parsedItems
      }));
    } catch {
      // ignore
    }
  }, [rawText, parsedItems]);

  // Dragging state
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    itemId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Safe identifier generator
  const createIdentifierFromName = (name: string): string => {
    const clean = name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_');
    return clean.startsWith('PARAM_') ? clean : `PARAM_${clean || 'VALUE'}`;
  };

  // Parse raw text into div items
  const parseRawDivData = (input: string) => {
    if (!input.trim()) {
      setParsedItems([]);
      setSelectedItemId(null);
      return;
    }

    const defaultScreenId = project.screens[0]?.id || 'new';
    const items: ParsedDivItem[] = [];
    const divRegex = /<div\b([\s\S]*?)>([\s\S]*?)<\/div>/gi;
    let match: RegExpExecArray | null;

    let index = 0;
    const matchedIndices = new Set<number>();

    // 1. Try HTML <div> regex extraction
    while ((match = divRegex.exec(input)) !== null) {
      matchedIndices.add(match.index);
      const attrsStr = match[1] || '';
      const innerHtml = match[2] || '';

      // Extract left, top, width, height from style="..." or inline coords
      let x = 40 + (index % 3) * 220;
      let y = 80 + Math.floor(index / 3) * 90;
      let width = 160;
      let height = 50;

      const leftMatch = attrsStr.match(/left:\s*([0-9.]+)\s*px?/i) || attrsStr.match(/x[:=]\s*([0-9.]+)/i);
      const topMatch = attrsStr.match(/top:\s*([0-9.]+)\s*px?/i) || attrsStr.match(/y[:=]\s*([0-9.]+)/i);
      const widthMatch = attrsStr.match(/width:\s*([0-9.]+)\s*px?/i) || attrsStr.match(/w[:=]\s*([0-9.]+)/i);
      const heightMatch = attrsStr.match(/height:\s*([0-9.]+)\s*px?/i) || attrsStr.match(/h[:=]\s*([0-9.]+)/i);

      if (leftMatch) x = Math.round(parseFloat(leftMatch[1]));
      if (topMatch) y = Math.round(parseFloat(topMatch[1]));
      if (widthMatch) width = Math.round(parseFloat(widthMatch[1]));
      if (heightMatch) height = Math.round(parseFloat(heightMatch[1]));

      // Extract id or class as name hint
      const idMatch = attrsStr.match(/id=["']([^"']+)["']/i);
      const classMatch = attrsStr.match(/class=["']([^"']+)["']/i);
      const fallbackName = idMatch ? idMatch[1].replace(/[-_]/g, ' ') : classMatch ? classMatch[1].replace(/[-_]/g, ' ') : `DIV Value #${index + 1}`;

      // Clean inner text to extract label, value, and unit
      // Strip html tags for plain text inspection
      const plainText = innerHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

      // Detect value & unit
      const parsedUnitMatch = plainText.match(/([-+]?[0-9]*\.?[0-9]+)\s*([°a-zA-Z%/\^]+)/) ||
                              plainText.match(/\b(0x[0-9a-fA-F]+)\b/) ||
                              plainText.match(/\b(RUNNING|STOPPED|ALARM|TRIP|ON|OFF|OK)\b/i);

      let extractedValue = '0';
      let inferredUnit = '';
      let extractedLabel = fallbackName;

      if (parsedUnitMatch) {
        if (parsedUnitMatch[2]) {
          extractedValue = parsedUnitMatch[1];
          inferredUnit = parsedUnitMatch[2].trim();
        } else if (parsedUnitMatch[1]) {
          extractedValue = parsedUnitMatch[1];
        }
        // Label is remaining text
        const labelCandidate = plainText.replace(parsedUnitMatch[0], '').replace(/[:=\-_]/g, ' ').trim();
        if (labelCandidate) {
          extractedLabel = labelCandidate;
        }
      } else if (plainText) {
        extractedValue = plainText;
      }

      // Infer data type
      let inferredType: DwinDataType = 'UINT16';
      let scale = 1;
      let min = 0;
      let max = 65535;

      if (extractedValue.includes('.')) {
        inferredType = 'FLOAT32';
        scale = 10;
        min = -1000;
        max = 10000;
      } else if (extractedValue.toLowerCase().startsWith('0x')) {
        inferredType = 'UINT16';
      } else if (/^(RUNNING|STOPPED|ON|OFF|ALARM)$/i.test(extractedValue)) {
        inferredType = 'BITFIELD';
        max = 1;
      }

      const assignedVp = getSafeNextVp(index);
      const formattedLabel = extractedLabel.replace(/\b\w/g, c => c.toUpperCase()).trim();

      items.push({
        id: `div_item_${index}_${Date.now()}`,
        rawText: plainText || attrsStr,
        rawHtml: match[0],
        extractedLabel: formattedLabel,
        extractedValue,
        inferredUnit,
        x: Math.max(0, Math.min(x, screenDimensions.width - 40)),
        y: Math.max(0, Math.min(y, screenDimensions.height - 30)),
        width: Math.max(80, Math.min(width, 400)),
        height: Math.max(30, Math.min(height, 200)),
        isTagged: true,
        taggedParamName: formattedLabel,
        taggedIdentifier: createIdentifierFromName(formattedLabel),
        assignedVpAddress: assignedVp,
        dataType: inferredType,
        unit: inferredUnit,
        scale,
        min,
        max,
        role: inferredType === 'BITFIELD' ? 'status_icon' : 'data_display',
        targetScreenId: defaultScreenId,
        newScreenNumber: project.screens.length,
        newScreenName: 'Imported Screen',
        description: `Parsed from DIV dump: ${attrsStr ? attrsStr.slice(0, 45) : plainText.slice(0, 45)}`
      });

      index++;
    }

    // 2. Fallback: If no HTML tags were found, parse line by line (key-value, CSV, or style lines)
    if (items.length === 0) {
      const lines = input.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      lines.forEach((line, lineIdx) => {
        let x = 50 + (lineIdx % 3) * 220;
        let y = 80 + Math.floor(lineIdx / 3) * 80;
        let width = 160;
        let height = 48;

        const leftMatch = line.match(/left[:=]\s*([0-9.]+)/i) || line.match(/x[:=]\s*([0-9.]+)/i);
        const topMatch = line.match(/top[:=]\s*([0-9.]+)/i) || line.match(/y[:=]\s*([0-9.]+)/i);
        const widthMatch = line.match(/width[:=]\s*([0-9.]+)/i) || line.match(/w[:=]\s*([0-9.]+)/i);
        const heightMatch = line.match(/height[:=]\s*([0-9.]+)/i) || line.match(/h[:=]\s*([0-9.]+)/i);

        if (leftMatch) x = Math.round(parseFloat(leftMatch[1]));
        if (topMatch) y = Math.round(parseFloat(topMatch[1]));
        if (widthMatch) width = Math.round(parseFloat(widthMatch[1]));
        if (heightMatch) height = Math.round(parseFloat(heightMatch[1]));

        // Split label and value by '=>', ':', '=', or '-'
        let label = `Item ${lineIdx + 1}`;
        let value = '0';
        let unit = '';

        if (line.includes('=>')) {
          const parts = line.split('=>');
          const valuePart = parts[1].trim();
          const valMatch = valuePart.match(/([-+]?[0-9]*\.?[0-9]+)\s*([°a-zA-Z%/\^]+)?/);
          if (valMatch) {
            value = valMatch[1];
            unit = valMatch[2] || '';
            label = valuePart.replace(valMatch[0], '').replace(/[:=]/g, '').trim() || parts[0].trim();
          } else {
            value = valuePart;
            label = parts[0].trim();
          }
        } else if (line.includes(':')) {
          const parts = line.split(':');
          label = parts[0].trim();
          const valuePart = parts.slice(1).join(':').trim();
          const valMatch = valuePart.match(/([-+]?[0-9]*\.?[0-9]+)\s*([°a-zA-Z%/\^]+)?/);
          if (valMatch) {
            value = valMatch[1];
            unit = valMatch[2] || '';
          } else {
            value = valuePart;
          }
        } else {
          // generic line
          const numMatch = line.match(/([-+]?[0-9]*\.?[0-9]+)\s*([°a-zA-Z%/\^]+)?/);
          if (numMatch) {
            value = numMatch[1];
            unit = numMatch[2] || '';
            label = line.replace(numMatch[0], '').trim() || `Token ${lineIdx + 1}`;
          } else {
            label = line;
          }
        }

        const assignedVp = getSafeNextVp(lineIdx);
        const cleanLabel = label.replace(/[#._\-{}<>]/g, ' ').replace(/\s+/g, ' ').trim() || `Parameter ${lineIdx + 1}`;

        items.push({
          id: `div_item_${lineIdx}_${Date.now()}`,
          rawText: line,
          extractedLabel: cleanLabel,
          extractedValue: value,
          inferredUnit: unit,
          x: Math.max(0, Math.min(x, screenDimensions.width - 40)),
          y: Math.max(0, Math.min(y, screenDimensions.height - 30)),
          width: Math.max(80, Math.min(width, 400)),
          height: Math.max(30, Math.min(height, 200)),
          isTagged: true,
          taggedParamName: cleanLabel,
          taggedIdentifier: createIdentifierFromName(cleanLabel),
          assignedVpAddress: assignedVp,
          dataType: value.includes('.') ? 'FLOAT32' : 'UINT16',
          unit,
          scale: value.includes('.') ? 10 : 1,
          min: 0,
          max: 65535,
          role: 'data_display',
          targetScreenId: defaultScreenId,
          newScreenNumber: project.screens.length,
          newScreenName: 'Imported Screen',
          description: `Extracted from raw line: ${line.slice(0, 50)}`
        });
      });
    }

    setParsedItems(items);
    if (items.length > 0) {
      setSelectedItemId(items[0].id);
      setStatusMessage({
        type: 'success',
        text: `Extracted ${items.length} div elements & values. Ready to inspect on canvas and tag parameters.`
      });
    } else {
      setSelectedItemId(null);
      setStatusMessage({
        type: 'info',
        text: 'No elements could be extracted. Please paste HTML divs or coordinate lines.'
      });
    }
  };

  // Run initial parse on mount only if parsedItems is not already populated
  useEffect(() => {
    if (parsedItems.length === 0 && rawText) {
      parseRawDivData(rawText);
    } else if (parsedItems.length > 0 && !selectedItemId) {
      setSelectedItemId(parsedItems[0].id);
    }
  }, []);

  // Selected item reference
  const selectedItem = useMemo(() => {
    return parsedItems.find(it => it.id === selectedItemId) || null;
  }, [parsedItems, selectedItemId]);

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawText(content);
        parseRawDivData(content);
      }
    };
    reader.readAsText(file);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Update a single item
  const updateParsedItem = (id: string, updates: Partial<ParsedDivItem>) => {
    setParsedItems(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, ...updates };
        if (updates.taggedParamName && !updates.taggedIdentifier) {
          updated.taggedIdentifier = createIdentifierFromName(updates.taggedParamName);
        }
        return updated;
      }
      return item;
    }));
  };

  // Auto-tag all with sequential VPs
  const handleAutoTagAll = () => {
    const startBaseVp = getSafeNextVp(0);
    setParsedItems(prev => prev.map((item, idx) => {
      const vp = startBaseVp + (idx * 2);
      const name = item.extractedLabel || `Item ${idx + 1}`;
      return {
        ...item,
        isTagged: true,
        assignedVpAddress: vp,
        taggedParamName: name,
        taggedIdentifier: createIdentifierFromName(name),
        role: item.dataType === 'BITFIELD' ? 'status_icon' : 'data_display'
      };
    }));
    setStatusMessage({
      type: 'success',
      text: `Auto-tagged all ${parsedItems.length} elements with consecutive word-aligned VPs starting at ${formatVpHex(startBaseVp)}.`
    });
  };

  // Canvas mouse handlers for dragging elements
  const handleItemMouseDown = (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    setSelectedItemId(itemId);

    const item = parsedItems.find(it => it.id === itemId);
    if (!item) return;

    setDragState({
      itemId,
      startX: e.clientX,
      startY: e.clientY,
      origX: item.x,
      origY: item.y
    });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!dragState) return;

    const dx = (e.clientX - dragState.startX) / canvasZoom;
    const dy = (e.clientY - dragState.startY) / canvasZoom;

    const newX = Math.max(0, Math.min(Math.round(dragState.origX + dx), screenDimensions.width - 40));
    const newY = Math.max(0, Math.min(Math.round(dragState.origY + dy), screenDimensions.height - 30));

    updateParsedItem(dragState.itemId, { x: newX, y: newY });
  };

  const handleCanvasMouseUp = () => {
    if (dragState) {
      setDragState(null);
    }
  };

  // Import to project (Screen Registry & Parameter Registry)
  const handleCommitToProject = () => {
    if (parsedItems.length === 0) return;

    // Group items by target screen
    const targetScreenMap = new Map<string, ParsedDivItem[]>();
    parsedItems.forEach(item => {
      const scrKey = item.targetScreenId || project.screens[0]?.id || 'new';
      if (!targetScreenMap.has(scrKey)) {
        targetScreenMap.set(scrKey, []);
      }
      targetScreenMap.get(scrKey)!.push(item);
    });

    let createdScreensCount = 0;
    let boundVpsCount = 0;
    let createdParamsCount = 0;
    let lastActiveScreenId = project.screens[0]?.id || '';

    targetScreenMap.forEach((items, screenKey) => {
      if (screenKey === 'new' || !project.screens.some(s => s.id === screenKey)) {
        // Create new screen
        const nextScreenNum = project.screens.length + createdScreensCount;
        const newScreenBindings: ScreenVpBinding[] = items.map(it => ({
          id: `bind_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          vpAddress: it.assignedVpAddress,
          role: it.role,
          label: it.taggedParamName,
          x: it.x,
          y: it.y,
          width: it.width,
          height: it.height,
          notes: `Imported from DIV dump: ${it.rawText.slice(0, 30)}`
        }));

        const newScreen = addScreen({
          screenNumber: nextScreenNum,
          name: items[0]?.newScreenName || `Screen ${nextScreenNum} (Imported)`,
          group: 'Imported DIVs',
          resolution: project.resolution,
          bgImageIndex: nextScreenNum,
          bgImageUrl: canvasBg === 'blueprint' ? blueprintPanelImg : industrialDashboardImg,
          description: `Created via SCREEN Lab Raw DIV Visual Parser with ${items.length} mapped controls.`,
          vpBindings: newScreenBindings,
          navigations: []
        });

        lastActiveScreenId = newScreen.id;
        createdScreensCount++;
        boundVpsCount += items.length;
      } else {
        // Add bindings to existing screen
        const targetScreen = project.screens.find(s => s.id === screenKey);
        if (targetScreen) {
          const newBindings: ScreenVpBinding[] = items.map(it => ({
            id: `bind_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            vpAddress: it.assignedVpAddress,
            role: it.role,
            label: it.taggedParamName,
            x: it.x,
            y: it.y,
            width: it.width,
            height: it.height,
            notes: `Imported from DIV: ${it.rawText.slice(0, 30)}`
          }));

          updateScreen(screenKey, {
            vpBindings: [...targetScreen.vpBindings, ...newBindings]
          });
          lastActiveScreenId = screenKey;
          boundVpsCount += items.length;
        }
      }

      // Add all parameters to parameter registry
      items.forEach(it => {
        addParameter({
          vpAddress: it.assignedVpAddress,
          name: it.taggedParamName,
          identifier: it.taggedIdentifier,
          dataType: it.dataType,
          words: it.dataType === 'FLOAT32' || it.dataType === 'UINT32' || it.dataType === 'INT32' ? 2 : 1,
          unit: it.unit,
          scale: it.scale,
          min: it.min,
          max: it.max,
          defaultValue: it.extractedValue.includes('.') ? parseFloat(it.extractedValue) || 0 : parseInt(it.extractedValue, 10) || 0,
          role: 'read_write',
          group: 'Screen Lab Imports',
          description: it.description
        });
        createdParamsCount++;
      });
    });

    if (lastActiveScreenId) {
      setSelectedScreenId(lastActiveScreenId);
    }

    setStatusMessage({
      type: 'success',
      text: `Successfully imported ${boundVpsCount} VP bindings across ${createdScreensCount > 0 ? `${createdScreensCount} new screen(s)` : 'existing screens'} and added ${createdParamsCount} parameters to the project registry!`
    });
  };

  // Export structured JSON
  const handleExportJson = () => {
    const exportData = {
      source: 'DWIN DGUS SCREEN Lab Raw DIV Parser',
      timestamp: new Date().toISOString(),
      screenResolution: project.resolution,
      itemsCount: parsedItems.length,
      structuredItems: parsedItems.map(it => ({
        token: it.extractedLabel,
        rawValue: it.extractedValue,
        unit: it.unit,
        vpAddressHex: formatVpHex(it.assignedVpAddress),
        vpAddressDec: it.assignedVpAddress,
        parameterName: it.taggedParamName,
        identifier: it.taggedIdentifier,
        dataType: it.dataType,
        scale: it.scale,
        role: it.role,
        coordinates: { x: it.x, y: it.y, width: it.width, height: it.height },
        targetScreen: it.targetScreenId
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dwin_tagged_div_parameters_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export structured CSV
  const handleExportCsv = () => {
    const headers = ['Token Label', 'Raw Value', 'Unit', 'VP Address (HEX)', 'VP (DEC)', 'Parameter Name', 'Identifier', 'Data Type', 'Scale', 'Role', 'X', 'Y', 'Width', 'Height'];
    const rows = parsedItems.map(it => [
      `"${it.extractedLabel.replace(/"/g, '""')}"`,
      `"${it.extractedValue}"`,
      `"${it.unit}"`,
      `"${formatVpHex(it.assignedVpAddress)}"`,
      it.assignedVpAddress,
      `"${it.taggedParamName.replace(/"/g, '""')}"`,
      `"${it.taggedIdentifier}"`,
      `"${it.dataType}"`,
      it.scale,
      `"${it.role}"`,
      it.x,
      it.y,
      it.width,
      it.height
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dwin_tagged_div_parameters_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Controls & Status Bar */}
      {statusMessage && (
        <div className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-3 animate-in fade-in shadow-xs ${
          statusMessage.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
            : statusMessage.type === 'error'
            ? 'bg-red-50 border-red-200 text-red-900'
            : 'bg-indigo-50 border-indigo-200 text-indigo-900'
        }`}>
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {statusMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
            {statusMessage.type === 'info' && <Info className="w-4 h-4 text-indigo-600 shrink-0" />}
            <span className="font-medium">{statusMessage.text}</span>
          </div>
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' && (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab('screens')}
                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium cursor-pointer shadow-2xs"
                >
                  View Screens →
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('parameters')}
                  className="px-2.5 py-1 rounded bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 font-medium cursor-pointer"
                >
                  View Parameters →
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Raw Data Input Box & Presets */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-indigo-50 text-indigo-600">
                <FileText className="w-4 h-4" />
              </span>
              <h2 className="text-sm font-bold text-slate-900">
                1. Import Raw Text / Dumped DIV Values
              </h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                {parsedItems.length} DIV elements extracted
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Upload a .txt file or paste raw DIV text to visualize on the canvas and tag parameters.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".txt"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium cursor-pointer shadow-2xs transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              <span>Upload .txt</span>
            </button>
          </div>
        </div>

        {/* Textarea */}
        <div className="relative">
          <textarea
            value={rawText}
            onChange={(e) => {
              setRawText(e.target.value);
              parseRawDivData(e.target.value);
            }}
            placeholder="Paste raw <div> elements, styles (left: 100px; top: 120px;), coordinates, or telemetry strings here..."
            style={{ backgroundColor: '#ffffff', borderColor: '#ff0000' }}
            className="w-full h-48 p-3 font-mono text-xs bg-white text-slate-900 rounded-lg border-2 border-[#ff0000] focus:outline-none focus:ring-2 focus:ring-red-400 resize-y shadow-2xs"
            spellCheck={false}
          />
          <div className="absolute right-3 bottom-3 flex items-center gap-2">
            {rawText && (
              <button
                type="button"
                onClick={() => {
                  setRawText('');
                  setParsedItems([]);
                  setSelectedItemId(null);
                  try {
                    localStorage.removeItem(RAW_DIV_TAGGER_STORAGE_KEY);
                  } catch {
                    // ignore
                  }
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-[11px] font-medium cursor-pointer shadow-2xs transition-colors"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => parseRawDivData(rawText)}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold cursor-pointer shadow-xs"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Re-Parse DIVs</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace: Interactive Canvas Visualizer & Parameter Tagging Inspector */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        {/* Workspace Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="p-1 rounded-md bg-indigo-50 text-indigo-600">
              <Eye className="w-4 h-4" />
            </span>
            <h2 className="text-sm font-bold text-slate-900">
              2. Interactive DWIN Canvas &amp; Parameter Tagging
            </h2>
            <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              Resolution: {screenDimensions.width} × {screenDimensions.height} px
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            {/* View layout modes */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('canvas')}
                className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                  viewMode === 'canvas' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Canvas Only
              </button>
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                  viewMode === 'split' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Split View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                  viewMode === 'table' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Table Only
              </button>
            </div>

            {/* Canvas background selector */}
            <select
              value={canvasBg}
              onChange={(e) => setCanvasBg(e.target.value as any)}
              className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-medium focus:outline-none"
            >
              <option value="blueprint">Blueprint Panel</option>
              <option value="dashboard">Industrial Dashboard</option>
              <option value="grid_dark">Dark Grid</option>
              <option value="grid_light">Light Slate Grid</option>
            </select>

            {/* Canvas Zoom controls */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setCanvasZoom(prev => Math.max(0.4, prev - 0.1))}
                className="p-1 rounded text-slate-600 hover:text-slate-900 cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-[11px] px-1 text-slate-600 min-w-[40px] text-center">
                {Math.round(canvasZoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setCanvasZoom(prev => Math.min(1.5, prev + 0.1))}
                className="p-1 rounded text-slate-600 hover:text-slate-900 cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setCanvasZoom(0.9)}
                className="p-1 rounded text-slate-500 hover:text-slate-900 cursor-pointer"
                title="Reset Zoom"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>

            {/* Auto Tag All */}
            <button
              type="button"
              onClick={handleAutoTagAll}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-semibold cursor-pointer transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Auto-Tag All VPs</span>
            </button>
          </div>
        </div>

        {/* Split View Container */}
        <div className={`grid gap-5 ${
          viewMode === 'split' ? 'grid-cols-1 xl:grid-cols-12' : 'grid-cols-1'
        }`}>
          {/* Canvas Section */}
          {viewMode !== 'table' && (
            <div className={`${viewMode === 'split' ? 'xl:col-span-8' : 'w-full'} space-y-2`}>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Drag any element on the canvas to reposition (X, Y). Click to select and tag.</span>
                </div>
                {selectedItem && (
                  <span className="font-mono text-indigo-600 font-medium">
                    Selected: {selectedItem.extractedLabel} (X: {selectedItem.x}, Y: {selectedItem.y})
                  </span>
                )}
              </div>

              {/* Canvas Outer Viewport */}
              <div 
                ref={canvasRef}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                className="w-full overflow-auto bg-slate-950 rounded-xl p-4 border border-slate-800 shadow-inner min-h-[460px] flex items-center justify-center select-none"
              >
                {/* DWIN Screen Simulation Canvas */}
                <div
                  style={{
                    width: `${screenDimensions.width}px`,
                    height: `${screenDimensions.height}px`,
                    transform: `scale(${canvasZoom})`,
                    transformOrigin: 'top center',
                    backgroundImage: canvasBg === 'blueprint' 
                      ? `url(${blueprintPanelImg})` 
                      : canvasBg === 'dashboard' 
                      ? `url(${industrialDashboardImg})` 
                      : 'none',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    transition: dragState ? 'none' : 'transform 0.15s ease'
                  }}
                  className={`relative shrink-0 border-2 border-indigo-500/60 rounded-lg shadow-2xl overflow-hidden ${
                    canvasBg === 'grid_dark' 
                      ? 'bg-slate-900 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px]' 
                      : canvasBg === 'grid_light'
                      ? 'bg-slate-100 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px]'
                      : ''
                  }`}
                  onClick={() => setSelectedItemId(null)}
                >
                  {/* Resolution Overlay Tag */}
                  <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded bg-black/70 backdrop-blur-xs text-[10px] font-mono text-slate-300 pointer-events-none border border-white/10">
                    DWIN HMI • {screenDimensions.width}×{screenDimensions.height}
                  </div>

                  {/* Render Parsed DIVs */}
                  {parsedItems.map((item, idx) => {
                    const isSelected = item.id === selectedItemId;

                    return (
                      <div
                        key={item.id}
                        onMouseDown={(e) => handleItemMouseDown(e, item.id)}
                        style={{
                          position: 'absolute',
                          left: `${item.x}px`,
                          top: `${item.y}px`,
                          width: `${item.width}px`,
                          height: `${item.height}px`,
                          zIndex: isSelected ? 30 : 20
                        }}
                        className={`rounded-lg p-2 cursor-grab active:cursor-grabbing transition-shadow flex flex-col justify-between border backdrop-blur-md ${
                          isSelected
                            ? 'ring-2 ring-indigo-400 border-indigo-400 bg-indigo-950/85 text-white shadow-xl shadow-indigo-900/50 scale-[1.02]'
                            : item.isTagged
                            ? 'border-emerald-500/60 bg-slate-900/80 hover:bg-slate-900/95 text-slate-100 hover:border-emerald-400 shadow-md'
                            : 'border-slate-600 bg-slate-900/60 hover:bg-slate-900/80 text-slate-300'
                        }`}
                      >
                        {/* Header: Label & Assigned VP Badge */}
                        <div className="flex items-center justify-between gap-1 overflow-hidden pointer-events-none">
                          <span className="text-[10px] font-semibold truncate text-slate-300 uppercase tracking-wider">
                            {item.taggedParamName || item.extractedLabel}
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 shrink-0 font-bold">
                            {formatVpHex(item.assignedVpAddress)}
                          </span>
                        </div>

                        {/* Value & Inferred Unit Display */}
                        <div className="flex items-baseline justify-between gap-1 mt-auto pointer-events-none">
                          <div className="flex items-baseline gap-1 overflow-hidden">
                            <span className="text-sm font-bold font-mono tracking-tight text-emerald-300 truncate">
                              {item.extractedValue}
                            </span>
                            {item.unit && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                {item.unit}
                              </span>
                            )}
                          </div>
                          <span className="text-[9px] font-mono text-slate-400 shrink-0">
                            ({item.x},{item.y})
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Inspector Section: Parameter Tagging & Assignment */}
          <div className={`${viewMode === 'split' ? 'xl:col-span-4' : 'w-full'} space-y-4`}>
            {selectedItem ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4.5 space-y-4">
                {/* Header of Inspector */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded bg-indigo-100 text-indigo-700">
                      <Tag className="w-4 h-4" />
                    </span>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">
                        Tag &amp; Bind Parameter
                      </h3>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {formatVpHex(selectedItem.assignedVpAddress)} • {selectedItem.dataType}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                    Active Token
                  </span>
                </div>

                {/* Raw Extracted Value Preview */}
                <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-xs space-y-1">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">Raw DIV Token</span>
                  <div className="flex items-baseline justify-between font-mono">
                    <span className="text-slate-800 font-semibold text-sm">{selectedItem.extractedValue}</span>
                    <span className="text-slate-500">{selectedItem.unit || 'No unit'}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate font-mono">
                    {selectedItem.rawText}
                  </p>
                </div>

                {/* Form: Tagging Fields */}
                <div className="space-y-3 text-xs">
                  {/* Parameter Name */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Parameter Name (HMI Label)
                    </label>
                    <input
                      type="text"
                      value={selectedItem.taggedParamName}
                      onChange={(e) => updateParsedItem(selectedItem.id, { taggedParamName: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  {/* Identifier */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Code Identifier (Firmware / Hex Constant)
                    </label>
                    <input
                      type="text"
                      value={selectedItem.taggedIdentifier}
                      onChange={(e) => updateParsedItem(selectedItem.id, { taggedIdentifier: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 font-mono text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  {/* VP Address Hex & Suggestion */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Assigned VP Address (HEX)
                      </label>
                      <button
                        type="button"
                        onClick={() => updateParsedItem(selectedItem.id, { assignedVpAddress: getSafeNextVp(0) })}
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                      >
                        Auto Free VP
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={formatVpHex(selectedItem.assignedVpAddress)}
                        onChange={(e) => {
                          const parsed = parseHexOrDec(e.target.value, selectedItem.assignedVpAddress);
                          updateParsedItem(selectedItem.id, { assignedVpAddress: parsed });
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-indigo-700 font-mono text-xs font-bold focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      />
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">
                        ({selectedItem.assignedVpAddress})
                      </span>
                    </div>
                  </div>

                  {/* Data Type & Scaling */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Data Type
                      </label>
                      <select
                        value={selectedItem.dataType}
                        onChange={(e) => updateParsedItem(selectedItem.id, { dataType: e.target.value as DwinDataType })}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="UINT16">UINT16 (1 Word)</option>
                        <option value="INT16">INT16 (Signed)</option>
                        <option value="UINT32">UINT32 (2 Words)</option>
                        <option value="INT32">INT32 (2 Words)</option>
                        <option value="FLOAT32">FLOAT32 (IEEE 754)</option>
                        <option value="BITFIELD">BITFIELD (Bit icon)</option>
                        <option value="STRING">STRING</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Scale Factor
                      </label>
                      <select
                        value={selectedItem.scale}
                        onChange={(e) => updateParsedItem(selectedItem.id, { scale: Number(e.target.value) })}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value={1}>1:1 (Direct)</option>
                        <option value={10}>/10 (1 Decimal)</option>
                        <option value={100}>/100 (2 Decimals)</option>
                        <option value={1000}>/1000 (3 Decimals)</option>
                      </select>
                    </div>
                  </div>

                  {/* Target Screen Assignment */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Target Screen (Registry Binding)
                    </label>
                    <select
                      value={selectedItem.targetScreenId}
                      onChange={(e) => updateParsedItem(selectedItem.id, { targetScreenId: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="new">+ Create New Screen for Dump</option>
                      {project.screens.map(scr => (
                        <option key={scr.id} value={scr.id}>
                          Screen #{scr.screenNumber}: {scr.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Coordinates & Geometry */}
                  <div className="grid grid-cols-4 gap-1.5 pt-1">
                    <div>
                      <label className="text-[10px] text-slate-500 font-semibold block">X</label>
                      <input
                        type="number"
                        value={selectedItem.x}
                        onChange={(e) => updateParsedItem(selectedItem.id, { x: Number(e.target.value) })}
                        className="w-full px-2 py-1 rounded border border-slate-200 bg-white text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 font-semibold block">Y</label>
                      <input
                        type="number"
                        value={selectedItem.y}
                        onChange={(e) => updateParsedItem(selectedItem.id, { y: Number(e.target.value) })}
                        className="w-full px-2 py-1 rounded border border-slate-200 bg-white text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 font-semibold block">Width</label>
                      <input
                        type="number"
                        value={selectedItem.width}
                        onChange={(e) => updateParsedItem(selectedItem.id, { width: Number(e.target.value) })}
                        className="w-full px-2 py-1 rounded border border-slate-200 bg-white text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 font-semibold block">Height</label>
                      <input
                        type="number"
                        value={selectedItem.height}
                        onChange={(e) => updateParsedItem(selectedItem.id, { height: Number(e.target.value) })}
                        className="w-full px-2 py-1 rounded border border-slate-200 bg-white text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center space-y-2">
                <Move className="w-8 h-8 text-slate-400 mx-auto" />
                <h4 className="text-xs font-bold text-slate-700">No Item Selected</h4>
                <p className="text-xs text-slate-500">
                  Click any element on the DWIN canvas or row in the structured table below to tag and bind its parameter.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Structured Data Table & Commit / Export Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-indigo-50 text-indigo-600">
                <LayoutGrid className="w-4 h-4" />
              </span>
              <h2 className="text-sm font-bold text-slate-900">
                3. Structured Parameter Matrix &amp; Integration
              </h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                {parsedItems.filter(it => it.isTagged).length} / {parsedItems.length} Tagged
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Verify all extracted parameters, variable addresses, and coordinates before committing directly to the Screen &amp; Parameter Registries.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleExportJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium cursor-pointer shadow-2xs transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export JSON</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium cursor-pointer shadow-2xs transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={handleCommitToProject}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Commit to Screen Registry &amp; Parameters</span>
            </button>
          </div>
        </div>

        {/* Structured Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase font-semibold text-[10px]">
              <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Token Label</th>
                <th className="py-2.5 px-3">Raw Value</th>
                <th className="py-2.5 px-3">Assigned VP</th>
                <th className="py-2.5 px-3">Code Identifier</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Coordinates (X, Y)</th>
                <th className="py-2.5 px-3">Target Screen</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {parsedItems.map((item, idx) => {
                const isSelected = item.id === selectedItemId;

                return (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-indigo-50/70 font-medium' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="py-2 px-3 font-mono text-slate-400 text-[11px]">
                      {(idx + 1).toString().padStart(2, '0')}
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-900">
                      {item.taggedParamName}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-emerald-600">
                      {item.extractedValue} {item.unit}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-indigo-700">
                      {formatVpHex(item.assignedVpAddress)}
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px] text-slate-600">
                      {item.taggedIdentifier}
                    </td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-semibold">
                        {item.dataType}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                      {item.x}, {item.y} ({item.width}×{item.height})
                    </td>
                    <td className="py-2 px-3 text-slate-700">
                      {item.targetScreenId === 'new' 
                        ? '+ New Screen' 
                        : `Screen #${project.screens.find(s => s.id === item.targetScreenId)?.screenNumber ?? 0}`}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setParsedItems(prev => prev.filter(it => it.id !== item.id));
                          if (selectedItemId === item.id) setSelectedItemId(null);
                        }}
                        className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Remove token"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
