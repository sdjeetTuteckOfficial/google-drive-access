import React, { useState, useEffect } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import {
  Check,
  Minus,
  X,
  Loader2,
  Folder,
  FileText,
  Image as ImageIcon,
  ChevronRight,
  ArrowLeft,
  Cloud,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

// --- Toast Component ---
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColors = {
    error: 'bg-red-500 text-white',
    success: 'bg-green-600 text-white',
    info: 'bg-slate-800 text-white',
    warning: 'bg-amber-500 text-white',
  };

  return (
    <div
      className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-xl flex items-center gap-3 transition-all animate-in fade-in slide-in-from-top-4 ${bgColors[type]}`}
    >
      <span className='font-medium text-sm'>{message}</span>
      <button onClick={onClose} className='ml-2 opacity-70 hover:opacity-100'>
        <X className='w-4 h-4' />
      </button>
    </div>
  );
};

function GoogleDriveViewer() {
  const [token, setToken] = useState(null);
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);

  // Navigation State
  const [currentFolderId, setCurrentFolderId] = useState('root');
  const [folderStack, setFolderStack] = useState([
    { id: 'root', name: 'My Drive' },
  ]);

  // Selection State
  const [checkedFiles, setCheckedFiles] = useState(new Map());
  const [folderSelectionStatus, setFolderSelectionStatus] = useState(new Map());

  const MAX_FILES = 5;

  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedFiles, setProcessedFiles] = useState([]);
  const [processingProgress, setProcessingProgress] = useState(0);

  // UI State
  const [loadingFolders, setLoadingFolders] = useState(new Set());
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const originalError = console.error;
    console.error = (...args) => {
      if (args[0]?.includes?.('Cross-Origin-Opener-Policy')) return;
      originalError.apply(console, args);
    };
    return () => {
      console.error = originalError;
    };
  }, []);

  const showToast = (message, type = 'info') => setToast({ message, type });

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setToken(tokenResponse.access_token);
      await listFiles(tokenResponse.access_token, 'root');
      setShowFilePicker(true);
    },
    onError: () => showToast('Login failed', 'error'),
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    flow: 'implicit',
  });

  // --- API ---
  const listFiles = async (accessToken = token, folderId = currentFolderId) => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const query = `'${folderId}' in parents and trashed=false`;
      const response = await fetch(
        'https://www.googleapis.com/drive/v3/files?' +
          new URLSearchParams({
            pageSize: '100',
            fields: 'nextPageToken, files(id, name, mimeType, size)',
            orderBy: 'folder,modifiedTime desc',
            q: query,
          }),
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!response.ok) throw new Error('API Error');
      const data = await response.json();
      setFiles(data.files || []);
    } catch (err) {
      showToast('Failed to load files', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFolderContents = async (folderId) => {
    try {
      const query = `'${folderId}' in parents and trashed=false`;
      const response = await fetch(
        'https://www.googleapis.com/drive/v3/files?' +
          new URLSearchParams({
            pageSize: '50',
            fields: 'files(id, name, mimeType, size)',
            q: query,
          }),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      return data.files || [];
    } catch (e) {
      return [];
    }
  };

  // --- Navigation Logic (FIXED) ---

  // 1. Go Deeper (Append to stack)
  const openFolder = (id, name) => {
    setCurrentFolderId(id);
    setFolderStack([...folderStack, { id, name }]);
    listFiles(token, id);
  };

  // 2. Go Back One Step (Pop from stack)
  const goBackOneStep = () => {
    if (folderStack.length > 1) {
      const newStack = folderStack.slice(0, -1);
      const parent = newStack[newStack.length - 1];
      setFolderStack(newStack);
      setCurrentFolderId(parent.id);
      listFiles(token, parent.id);
    }
  };

  // 3. Jump to Breadcrumb (Slice stack)
  const handleBreadcrumbClick = (index) => {
    // If clicking the current folder, do nothing
    if (index === folderStack.length - 1) return;

    // Slice the stack up to the selected index (inclusive)
    const newStack = folderStack.slice(0, index + 1);
    const targetFolder = newStack[newStack.length - 1];

    setFolderStack(newStack);
    setCurrentFolderId(targetFolder.id);
    listFiles(token, targetFolder.id);
  };

  // --- Selection Logic ---

  const handleFileCheck = (file) => {
    setCheckedFiles((prev) => {
      const newChecked = new Map(prev);
      if (newChecked.has(file.id)) {
        newChecked.delete(file.id);
      } else {
        if (newChecked.size >= MAX_FILES) {
          showToast(`Limit reached. Max ${MAX_FILES} files.`, 'error');
          return prev;
        }
        newChecked.set(file.id, { ...file, parentFolderId: currentFolderId });
      }
      return newChecked;
    });
  };

  const handleFolderCheck = async (folder) => {
    const isAlreadySelected = folderSelectionStatus.has(folder.id);

    if (isAlreadySelected) {
      // Uncheck Folder
      setFolderSelectionStatus((prev) => {
        const next = new Map(prev);
        next.delete(folder.id);
        return next;
      });
      setCheckedFiles((prev) => {
        const next = new Map(prev);
        for (const [id, file] of next.entries()) {
          if (file.parentFolderId === folder.id) next.delete(id);
        }
        return next;
      });
      return;
    }

    // Check Folder
    setLoadingFolders((prev) => new Set(prev).add(folder.id));

    try {
      const contents = await fetchFolderContents(folder.id);
      const validFiles = contents.filter(
        (f) =>
          !f.mimeType.startsWith('application/vnd.google-apps.') &&
          f.mimeType !== 'application/vnd.google-apps.folder'
      );

      if (validFiles.length === 0) {
        showToast('Folder is empty', 'info');
        return;
      }

      setCheckedFiles((prev) => {
        const slotsLeft = MAX_FILES - prev.size;
        if (slotsLeft <= 0) {
          showToast('Selection full.', 'error');
          return prev;
        }

        const newMap = new Map(prev);
        let addedCount = 0;

        for (const file of validFiles) {
          if (addedCount >= slotsLeft) break;
          if (!newMap.has(file.id)) {
            newMap.set(file.id, { ...file, parentFolderId: folder.id });
            addedCount++;
          }
        }

        const isPartial = addedCount < validFiles.length;
        setFolderSelectionStatus((statusMap) => {
          const next = new Map(statusMap);
          next.set(folder.id, isPartial ? 'partial' : 'all');
          return next;
        });

        isPartial
          ? showToast(`Added ${addedCount} files. Limit reached.`, 'warning')
          : showToast(`Selected ${addedCount} files.`, 'success');

        return newMap;
      });
    } catch (error) {
      showToast('Error reading folder', 'error');
    } finally {
      setLoadingFolders((prev) => {
        const next = new Set(prev);
        next.delete(folder.id);
        return next;
      });
    }
  };

  const processSelection = async () => {
    setIsProcessing(true);
    setProcessingProgress(0);
    setShowFilePicker(false);

    const total = checkedFiles.size;
    let current = 0;
    const results = [];

    for (const file of checkedFiles.values()) {
      await new Promise((r) => setTimeout(r, 500));
      current++;
      setProcessingProgress(Math.round((current / total) * 100));
      results.push({ ...file, status: 'success' });
    }

    setProcessedFiles(results);
    setIsProcessing(false);
    setCheckedFiles(new Map());
    setFolderSelectionStatus(new Map());
    showToast('Import completed', 'success');
  };

  const getIcon = (mime) => {
    if (mime.includes('folder'))
      return <Folder className='w-6 h-6 text-blue-500 fill-blue-50' />;
    if (mime.includes('image'))
      return <ImageIcon className='w-6 h-6 text-purple-600' />;
    if (mime.includes('pdf'))
      return <FileText className='w-6 h-6 text-red-500' />;
    return <FileText className='w-6 h-6 text-slate-500' />;
  };

  return (
    <div className='min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans'>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className='w-full max-w-3xl'>
        <div className='bg-white rounded-3xl shadow-xl overflow-hidden'>
          <div className='bg-slate-900 p-8 text-white'>
            <h1 className='text-2xl font-bold flex items-center gap-3'>
              <Cloud className='text-blue-400' /> Cloud Import
            </h1>
          </div>

          <div className='p-8'>
            {processedFiles.length > 0 && (
              <div className='mb-6 flex flex-wrap gap-2'>
                {processedFiles.map((f) => (
                  <span
                    key={f.id}
                    className='bg-green-50 text-green-700 px-3 py-1 rounded-full text-sm border border-green-200 flex items-center gap-1'
                  >
                    <CheckCircle2 className='w-3 h-3' /> {f.name}
                  </span>
                ))}
              </div>
            )}

            <div
              onClick={() => (!token ? login() : setShowFilePicker(true))}
              className='border-2 border-dashed border-slate-300 rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 hover:border-blue-400 transition-all group'
            >
              <div className='bg-blue-50 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform'>
                <Folder className='w-8 h-8 text-blue-600' />
              </div>
              <p className='text-slate-600 font-medium'>Browse Google Drive</p>
              <p className='text-slate-400 text-xs mt-1'>
                {processedFiles.length > 0
                  ? 'Import more files'
                  : 'Select up to 5 files'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* --- File Picker Modal --- */}
      {showFilePicker && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
          <div
            className='absolute inset-0 bg-black/40 backdrop-blur-sm'
            onClick={() => setShowFilePicker(false)}
          />

          <div className='bg-white w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200'>
            {/* Header */}
            <div className='px-6 py-4 border-b flex justify-between items-center bg-white'>
              <div>
                <h2 className='text-xl font-bold text-slate-800'>
                  Select Files
                </h2>
                <div className='text-xs font-medium text-slate-500 mt-0.5'>
                  <span
                    className={`${
                      checkedFiles.size === MAX_FILES
                        ? 'text-red-500'
                        : 'text-blue-600'
                    }`}
                  >
                    {checkedFiles.size} / {MAX_FILES} selected
                  </span>
                </div>
              </div>
              <div className='flex gap-3'>
                <button
                  onClick={() => setShowFilePicker(false)}
                  className='px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition'
                >
                  Cancel
                </button>
                <button
                  onClick={processSelection}
                  disabled={checkedFiles.size === 0}
                  className='px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-sm font-medium transition shadow-lg shadow-blue-500/30 disabled:shadow-none'
                >
                  Import
                </button>
              </div>
            </div>

            {/* Breadcrumbs (FIXED) */}
            <div className='px-6 py-2 bg-slate-50 border-b flex items-center gap-2 overflow-x-auto no-scrollbar'>
              {folderStack.length > 1 && (
                <button
                  onClick={goBackOneStep}
                  className='p-1 hover:bg-slate-200 rounded-full mr-2'
                  title='Go Back'
                >
                  <ArrowLeft className='w-4 h-4 text-slate-600' />
                </button>
              )}
              {folderStack.map((f, i) => (
                <div
                  key={f.id}
                  className='flex items-center text-sm whitespace-nowrap'
                >
                  {i > 0 && (
                    <ChevronRight className='w-4 h-4 text-slate-400 mx-1' />
                  )}
                  <span
                    onClick={() => handleBreadcrumbClick(i)} // Calls Slice, not Append
                    className={`cursor-pointer transition-colors ${
                      i === folderStack.length - 1
                        ? 'font-bold text-slate-900 bg-white px-2 py-0.5 rounded shadow-sm'
                        : 'text-slate-500 hover:text-blue-600 hover:underline'
                    }`}
                  >
                    {f.name}
                  </span>
                </div>
              ))}
            </div>

            {/* List */}
            <div className='flex-1 overflow-y-auto p-4 bg-slate-50/50'>
              {isLoading ? (
                <div className='flex flex-col items-center justify-center h-full text-slate-400'>
                  <Loader2 className='w-8 h-8 animate-spin mb-2' />
                  Loading...
                </div>
              ) : (
                <div className='space-y-2'>
                  {files.map((file) => {
                    const isDir =
                      file.mimeType === 'application/vnd.google-apps.folder';
                    const isFileSelected = checkedFiles.has(file.id);
                    const folderStatus = folderSelectionStatus.get(file.id);
                    const isFolderSelected = !!folderStatus;
                    const isAnySelected = isDir
                      ? isFolderSelected
                      : isFileSelected;
                    const isLoadingFolder = loadingFolders.has(file.id);
                    const canSelect =
                      isDir ||
                      !file.mimeType.startsWith('application/vnd.google-apps.');

                    return (
                      <div
                        key={file.id}
                        className={`group flex items-center p-3 bg-white rounded-xl border transition-all hover:shadow-md ${
                          isAnySelected
                            ? 'border-blue-500 bg-blue-50/30'
                            : 'border-slate-200 hover:border-blue-300'
                        }`}
                      >
                        {/* Checkbox */}
                        <div
                          className='mr-4 pl-1'
                          onClick={(e) => {
                            e.stopPropagation();
                            if (canSelect) {
                              if (isDir) handleFolderCheck(file);
                              else handleFileCheck(file);
                            }
                          }}
                        >
                          {isLoadingFolder ? (
                            <Loader2 className='w-6 h-6 text-blue-600 animate-spin' />
                          ) : (
                            <div
                              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all duration-200 ${
                                isAnySelected
                                  ? 'bg-blue-600 border-blue-600'
                                  : 'border-slate-300 bg-white hover:border-blue-400'
                              }`}
                            >
                              {isDir && folderStatus === 'partial' ? (
                                <Minus className='w-3.5 h-3.5 text-white' />
                              ) : (
                                isAnySelected && (
                                  <Check className='w-3.5 h-3.5 text-white stroke-[3]' />
                                )
                              )}
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div
                          className={`flex-1 flex items-center gap-3 ${
                            isDir ? 'cursor-pointer' : ''
                          }`}
                          onClick={() =>
                            isDir && openFolder(file.id, file.name)
                          }
                        >
                          <div className='p-2 bg-slate-100 rounded-lg text-slate-600'>
                            {getIcon(file.mimeType)}
                          </div>
                          <div className='flex-1 min-w-0'>
                            <p
                              className={`text-sm font-medium truncate ${
                                isAnySelected
                                  ? 'text-blue-900'
                                  : 'text-slate-700'
                              }`}
                            >
                              {file.name}
                            </p>
                            <p className='text-xs text-slate-400 flex items-center gap-2'>
                              {isDir
                                ? folderStatus === 'partial'
                                  ? 'Partial'
                                  : 'Folder'
                                : `${Math.round(file.size / 1024)} KB`}
                              {!canSelect && !isDir && (
                                <span className='text-red-400 text-[10px] bg-red-50 px-1 rounded'>
                                  Unsupported
                                </span>
                              )}
                            </p>
                          </div>
                          {isDir && (
                            <ChevronRight className='w-5 h-5 text-slate-300 group-hover:text-blue-400' />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Processing Overlay */}
      {isProcessing && (
        <div className='fixed inset-0 z-[60] bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center'>
          <div className='w-64 bg-slate-100 rounded-full h-2 mb-4 overflow-hidden'>
            <div
              className='bg-blue-600 h-full transition-all duration-300'
              style={{ width: `${processingProgress}%` }}
            />
          </div>
          <p className='text-slate-600 font-medium animate-pulse'>
            Processing...
          </p>
        </div>
      )}
    </div>
  );
}

export default GoogleDriveViewer;
