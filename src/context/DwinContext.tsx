/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { DwinProject, Screen, Parameter, ScreenVpBinding, ScreenNavigation } from '../types/dwin';
import { initialDwinProject } from '../data/sampleProject';

export type ActiveWorkspaceTab = 'screens' | 'screenlab' | 'parameters' | 'explorer' | 'hexlab' | 'import_export';

interface DwinContextType {
  project: DwinProject;
  activeTab: ActiveWorkspaceTab;
  setActiveTab: (tab: ActiveWorkspaceTab) => void;
  selectedScreenId: string | null;
  setSelectedScreenId: (id: string | null) => void;
  selectedParamId: string | null;
  setSelectedParamId: (id: string | null) => void;
  
  // Hex Lab prefill state
  hexLabPrefill: {
    vpAddress?: number;
    value?: number | string;
    cmd?: number;
    mode?: 'generator' | 'decoder' | 'comparator';
    presetHex?: string;
  } | null;
  setHexLabPrefill: (prefill: DwinContextType['hexLabPrefill']) => void;
  jumpToHexLabWithParam: (param: Parameter) => void;
  jumpToHexLabWithFrame: (frameHex: string) => void;

  // Project mutations
  updateProjectMetadata: (updates: Partial<Pick<DwinProject, 'name' | 'version' | 'description' | 'dwinModel' | 'resolution' | 'headerHex'>>) => void;
  resetProjectToDefault: () => void;
  createNewProject: (name?: string) => void;
  importProject: (imported: DwinProject) => void;

  // Screen operations
  isBatchScreenModalOpen: boolean;
  setIsBatchScreenModalOpen: (open: boolean) => void;
  openBatchScreenCreator: () => void;
  addScreen: (screen: Omit<Screen, 'id' | 'updatedAt'>) => Screen;
  updateScreen: (id: string, updates: Partial<Screen>) => void;
  batchUpdateScreenImages: (mappings: { screenId: string; bgImageUrl: string }[]) => void;
  batchCreateScreens: (newScreens: Omit<Screen, 'id' | 'updatedAt'>[], newParams?: Omit<Parameter, 'id' | 'updatedAt'>[]) => Screen[];
  deleteScreen: (id: string) => void;
  duplicateScreen: (id: string) => Screen;
  addVpBindingToScreen: (screenId: string, binding: Omit<ScreenVpBinding, 'id'>) => void;
  removeVpBindingFromScreen: (screenId: string, bindingId: string) => void;
  addNavigationToScreen: (screenId: string, nav: Omit<ScreenNavigation, 'id'>) => void;
  removeNavigationFromScreen: (screenId: string, navId: string) => void;

  // Parameter operations
  addParameter: (param: Omit<Parameter, 'id' | 'updatedAt'>) => Parameter;
  updateParameter: (id: string, updates: Partial<Parameter>) => void;
  deleteParameter: (id: string) => void;
  duplicateParameter: (id: string) => Parameter;

  // Quick statistics & diagnostics
  stats: {
    totalScreens: number;
    totalParameters: number;
    totalVpBindings: number;
    orphanParametersCount: number;
    orphanScreensCount: number;
    duplicateVpCount: number;
  };
}

const STORAGE_KEY = 'dwin_hex_designer_project_v1';

const DwinContext = createContext<DwinContextType | undefined>(undefined);

export const DwinProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [project, setProject] = useState<DwinProject>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // Fallback
    }
    return initialDwinProject;
  });

  const [activeTab, setActiveTab] = useState<ActiveWorkspaceTab>('screens');
  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(project.screens[0]?.id || null);
  const [selectedParamId, setSelectedParamId] = useState<string | null>(project.parameters[0]?.id || null);
  const [hexLabPrefill, setHexLabPrefill] = useState<DwinContextType['hexLabPrefill']>(null);
  const [isBatchScreenModalOpen, setIsBatchScreenModalOpen] = useState(false);
  const openBatchScreenCreator = () => setIsBatchScreenModalOpen(true);

  // Sync with localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch {
      // ignore storage quota issues
    }
  }, [project]);

  const updateProjectMetadata = (updates: Partial<Pick<DwinProject, 'name' | 'version' | 'description' | 'dwinModel' | 'resolution' | 'headerHex'>>) => {
    setProject(prev => ({
      ...prev,
      ...updates,
      updatedAt: new Date().toISOString()
    }));
  };

  const resetProjectToDefault = () => {
    setProject(initialDwinProject);
    setSelectedScreenId(initialDwinProject.screens[0]?.id || null);
    setSelectedParamId(initialDwinProject.parameters[0]?.id || null);
  };

  const createNewProject = (customName?: string) => {
    const freshScreenId = 'scr_0';
    const newBlankProject: DwinProject = {
      id: 'proj_' + Date.now().toString(36),
      name: customName || 'Untitled DWIN Project',
      version: '1.0.0',
      description: 'New DWIN DGUS HMI Project',
      dwinModel: 'DMG80480C070_03WTC (T5L2 ASIC - 800x480 Capacitive Touch)',
      resolution: '800x480',
      headerHex: '5A A5',
      updatedAt: new Date().toISOString(),
      screens: [
        {
          id: freshScreenId,
          screenNumber: 0,
          name: 'Screen 0',
          group: 'General',
          resolution: '800x480',
          bgImageIndex: 0,
          description: 'Initial display page 0',
          vpBindings: [],
          navigations: [],
          updatedAt: new Date().toISOString()
        }
      ],
      parameters: []
    };
    setProject(newBlankProject);
    setSelectedScreenId(freshScreenId);
    setSelectedParamId(null);
    setHexLabPrefill(null);
    setActiveTab('screens');
  };

  const importProject = (imported: DwinProject) => {
    setProject(imported);
    setSelectedScreenId(imported.screens[0]?.id || null);
    setSelectedParamId(imported.parameters[0]?.id || null);
  };

  const addScreen = (data: Omit<Screen, 'id' | 'updatedAt'>): Screen => {
    const newScreen: Screen = {
      ...data,
      id: 'scr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      updatedAt: new Date().toISOString()
    };
    setProject(prev => ({
      ...prev,
      screens: [...prev.screens, newScreen],
      updatedAt: new Date().toISOString()
    }));
    setSelectedScreenId(newScreen.id);
    return newScreen;
  };

  const updateScreen = (id: string, updates: Partial<Screen>) => {
    setProject(prev => ({
      ...prev,
      screens: prev.screens.map(s => (s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s)),
      updatedAt: new Date().toISOString()
    }));
  };

  const batchUpdateScreenImages = (mappings: { screenId: string; bgImageUrl: string }[]) => {
    const map = new Map(mappings.map(m => [m.screenId, m.bgImageUrl]));
    setProject(prev => ({
      ...prev,
      screens: prev.screens.map(s => {
        const newImg = map.get(s.id);
        return newImg ? { ...s, bgImageUrl: newImg, updatedAt: new Date().toISOString() } : s;
      }),
      updatedAt: new Date().toISOString()
    }));
  };

  const batchCreateScreens = (
    newScreensData: Omit<Screen, 'id' | 'updatedAt'>[],
    newParamsData: Omit<Parameter, 'id' | 'updatedAt'>[] = []
  ): Screen[] => {
    const timestamp = new Date().toISOString();
    const createdScreens: Screen[] = newScreensData.map((data, idx) => ({
      ...data,
      id: 'scr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6) + '_' + idx,
      updatedAt: timestamp
    }));

    const createdParams: Parameter[] = newParamsData.map((data, idx) => ({
      ...data,
      id: 'param_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6) + '_' + idx,
      updatedAt: timestamp
    }));

    setProject(prev => ({
      ...prev,
      screens: [...prev.screens, ...createdScreens],
      parameters: [...prev.parameters, ...createdParams],
      updatedAt: timestamp
    }));

    if (createdScreens.length > 0) {
      setSelectedScreenId(createdScreens[0].id);
    }
    return createdScreens;
  };

  const deleteScreen = (id: string) => {
    setProject(prev => ({
      ...prev,
      screens: prev.screens.filter(s => s.id !== id),
      updatedAt: new Date().toISOString()
    }));
    if (selectedScreenId === id) {
      setSelectedScreenId(null);
    }
  };

  const duplicateScreen = (id: string): Screen => {
    const target = project.screens.find(s => s.id === id);
    const highestNum = project.screens.reduce((max, s) => Math.max(max, s.screenNumber), 0);
    const newScreen: Screen = {
      ...(target || {
        screenNumber: highestNum + 1,
        name: 'New Screen',
        group: 'General',
        resolution: project.resolution,
        bgImageIndex: highestNum + 1,
        description: '',
        vpBindings: [],
        navigations: []
      }),
      id: 'scr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      screenNumber: highestNum + 1,
      name: `${target?.name || 'Screen'} (Copy)`,
      updatedAt: new Date().toISOString()
    };

    setProject(prev => ({
      ...prev,
      screens: [...prev.screens, newScreen],
      updatedAt: new Date().toISOString()
    }));
    setSelectedScreenId(newScreen.id);
    return newScreen;
  };

  const addVpBindingToScreen = (screenId: string, binding: Omit<ScreenVpBinding, 'id'>) => {
    const newBinding: ScreenVpBinding = {
      ...binding,
      id: 'b_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6)
    };
    setProject(prev => ({
      ...prev,
      screens: prev.screens.map(s =>
        s.id === screenId
          ? {
              ...s,
              vpBindings: [...s.vpBindings, newBinding],
              updatedAt: new Date().toISOString()
            }
          : s
      ),
      updatedAt: new Date().toISOString()
    }));
  };

  const removeVpBindingFromScreen = (screenId: string, bindingId: string) => {
    setProject(prev => ({
      ...prev,
      screens: prev.screens.map(s =>
        s.id === screenId
          ? {
              ...s,
              vpBindings: s.vpBindings.filter(b => b.id !== bindingId),
              updatedAt: new Date().toISOString()
            }
          : s
      ),
      updatedAt: new Date().toISOString()
    }));
  };

  const addNavigationToScreen = (screenId: string, nav: Omit<ScreenNavigation, 'id'>) => {
    const newNav: ScreenNavigation = {
      ...nav,
      id: 'nav_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6)
    };
    setProject(prev => ({
      ...prev,
      screens: prev.screens.map(s =>
        s.id === screenId
          ? {
              ...s,
              navigations: [...s.navigations, newNav],
              updatedAt: new Date().toISOString()
            }
          : s
      ),
      updatedAt: new Date().toISOString()
    }));
  };

  const removeNavigationFromScreen = (screenId: string, navId: string) => {
    setProject(prev => ({
      ...prev,
      screens: prev.screens.map(s =>
        s.id === screenId
          ? {
              ...s,
              navigations: s.navigations.filter(n => n.id !== navId),
              updatedAt: new Date().toISOString()
            }
          : s
      ),
      updatedAt: new Date().toISOString()
    }));
  };

  const addParameter = (data: Omit<Parameter, 'id' | 'updatedAt'>): Parameter => {
    const newParam: Parameter = {
      ...data,
      id: 'param_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      updatedAt: new Date().toISOString()
    };
    setProject(prev => ({
      ...prev,
      parameters: [...prev.parameters, newParam],
      updatedAt: new Date().toISOString()
    }));
    setSelectedParamId(newParam.id);
    return newParam;
  };

  const updateParameter = (id: string, updates: Partial<Parameter>) => {
    setProject(prev => ({
      ...prev,
      parameters: prev.parameters.map(p => (p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p)),
      updatedAt: new Date().toISOString()
    }));
  };

  const deleteParameter = (id: string) => {
    setProject(prev => ({
      ...prev,
      parameters: prev.parameters.filter(p => p.id !== id),
      updatedAt: new Date().toISOString()
    }));
    if (selectedParamId === id) {
      setSelectedParamId(null);
    }
  };

  const duplicateParameter = (id: string): Parameter => {
    const target = project.parameters.find(p => p.id === id);
    const highestVp = project.parameters.reduce((max, p) => Math.max(max, p.vpAddress + p.words), 0x1000);
    const newParam: Parameter = {
      ...(target || {
        name: 'New Parameter',
        identifier: 'PARAM_NEW',
        vpAddress: highestVp,
        dataType: 'UINT16',
        words: 1,
        unit: '',
        scale: 1,
        min: 0,
        max: 65535,
        defaultValue: 0,
        role: 'read_write',
        group: 'General',
        description: ''
      }),
      id: 'param_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      name: `${target?.name || 'Param'} (Copy)`,
      identifier: `${target?.identifier || 'PARAM'}_COPY`,
      vpAddress: highestVp,
      updatedAt: new Date().toISOString()
    };

    setProject(prev => ({
      ...prev,
      parameters: [...prev.parameters, newParam],
      updatedAt: new Date().toISOString()
    }));
    setSelectedParamId(newParam.id);
    return newParam;
  };

  const jumpToHexLabWithParam = (param: Parameter) => {
    setHexLabPrefill({
      vpAddress: param.vpAddress,
      value: param.defaultValue,
      cmd: param.role === 'read_only' ? 0x83 : 0x82,
      mode: 'generator'
    });
    setActiveTab('hexlab');
  };

  const jumpToHexLabWithFrame = (frameHex: string) => {
    setHexLabPrefill({
      mode: 'decoder',
      presetHex: frameHex
    });
    setActiveTab('hexlab');
  };

  // Diagnostics and stats calculation
  const allBoundVps = new Set<number>();
  project.screens.forEach(s => s.vpBindings.forEach(b => allBoundVps.add(b.vpAddress)));

  // Orphan parameters (defined but not bound to any screen)
  const orphanParams = project.parameters.filter(p => !allBoundVps.has(p.vpAddress));

  // Inbound navigations to each screen
  const inboundScreens = new Set<number>();
  project.screens.forEach(s => s.navigations.forEach(n => inboundScreens.add(n.targetScreenNumber)));
  // Screen 0 is root, so only check other screens
  const orphanScreens = project.screens.filter(s => s.screenNumber !== 0 && !inboundScreens.has(s.screenNumber));

  // Duplicate / Overlapping VP addresses
  const vpMap = new Map<number, Parameter[]>();
  project.parameters.forEach(p => {
    for (let w = 0; w < p.words; w++) {
      const addr = p.vpAddress + w;
      const list = vpMap.get(addr) || [];
      list.push(p);
      vpMap.set(addr, list);
    }
  });

  let duplicateVpCount = 0;
  vpMap.forEach(list => {
    if (list.length > 1) duplicateVpCount++;
  });

  const totalVpBindings = project.screens.reduce((sum, s) => sum + s.vpBindings.length, 0);

  return (
    <DwinContext.Provider
      value={{
        project,
        activeTab,
        setActiveTab,
        selectedScreenId,
        setSelectedScreenId,
        selectedParamId,
        setSelectedParamId,
        hexLabPrefill,
        setHexLabPrefill,
        jumpToHexLabWithParam,
        jumpToHexLabWithFrame,
        updateProjectMetadata,
        resetProjectToDefault,
        createNewProject,
        importProject,
        isBatchScreenModalOpen,
        setIsBatchScreenModalOpen,
        openBatchScreenCreator,
        addScreen,
        updateScreen,
        batchUpdateScreenImages,
        batchCreateScreens,
        deleteScreen,
        duplicateScreen,
        addVpBindingToScreen,
        removeVpBindingFromScreen,
        addNavigationToScreen,
        removeNavigationFromScreen,
        addParameter,
        updateParameter,
        deleteParameter,
        duplicateParameter,
        stats: {
          totalScreens: project.screens.length,
          totalParameters: project.parameters.length,
          totalVpBindings,
          orphanParametersCount: orphanParams.length,
          orphanScreensCount: orphanScreens.length,
          duplicateVpCount
        }
      }}
    >
      {children}
    </DwinContext.Provider>
  );
};

export const useDwin = () => {
  const context = useContext(DwinContext);
  if (!context) {
    throw new Error('useDwin must be used within a DwinProvider');
  }
  return context;
};
