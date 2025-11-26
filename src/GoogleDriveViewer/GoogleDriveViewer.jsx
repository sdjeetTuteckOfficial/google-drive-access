import React, { useState, useEffect } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { CheckCircle, Download, AlertCircle, Loader, X } from 'lucide-react';

function GoogleDriveViewer() {
  const [token, setToken] = useState(null);
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [message, setMessage] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState('root');
  const [folderStack, setFolderStack] = useState([
    { id: 'root', name: 'My Drive' },
  ]);
  const [checkedFiles, setCheckedFiles] = useState(new Set());
  const [uniqueFileKey, setUniqueFileKey] = useState(0);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedFiles, setProcessedFiles] = useState([]);
  const [processingProgress, setProcessingProgress] = useState(0);

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

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setToken(tokenResponse.access_token);
      await listFiles(tokenResponse.access_token, 'root');
      setShowFilePicker(true);
    },
    onError: (error) => {
      console.error('Login Failed:', error);
      alert('Login failed. Please try again.');
    },
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    flow: 'implicit',
  });

  const isDownloadableFile = (mimeType) => {
    const nonDownloadable = [
      'application/vnd.google-makersuite.prompt',
      'application/vnd.google-apps.folder',
      'application/vnd.google-apps.map',
      'application/vnd.google-apps.site',
    ];
    return (
      !nonDownloadable.includes(mimeType) &&
      !mimeType.startsWith('application/vnd.google-apps.')
    );
  };

  const isFolder = (mimeType) => {
    return mimeType === 'application/vnd.google-apps.folder';
  };

  const listFiles = async (accessToken = token, folderId = currentFolderId) => {
    if (!accessToken) return;

    setIsLoading(true);
    try {
      const query = `'${folderId}' in parents and trashed=false`;
      const response = await fetch(
        'https://www.googleapis.com/drive/v3/files?' +
          new URLSearchParams({
            pageSize: '50',
            fields:
              'nextPageToken, files(id, name, mimeType, webViewLink, iconLink, thumbnailLink, size, modifiedTime)',
            orderBy: 'folder,modifiedTime desc',
            q: query,
          }),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      setFiles(data.files || []);
    } catch (err) {
      console.error('Error listing files:', err);
      alert(
        'Failed to load files. Please check your permissions and try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const openFolder = (folderId, folderName) => {
    setCurrentFolderId(folderId);
    setFolderStack([...folderStack, { id: folderId, name: folderName }]);
    setCheckedFiles(new Set());
    setUniqueFileKey((prev) => prev + 1);
    listFiles(token, folderId);
  };

  const goBackFolder = () => {
    if (folderStack.length > 1) {
      const newStack = folderStack.slice(0, -1);
      const parentFolder = newStack[newStack.length - 1];
      setFolderStack(newStack);
      setCurrentFolderId(parentFolder.id);
      setCheckedFiles(new Set());
      setUniqueFileKey((prev) => prev + 1);
      listFiles(token, parentFolder.id);
    }
  };

  const goToFolder = (index) => {
    const newStack = folderStack.slice(0, index + 1);
    const targetFolder = newStack[newStack.length - 1];
    setFolderStack(newStack);
    setCurrentFolderId(targetFolder.id);
    setCheckedFiles(new Set());
    setUniqueFileKey((prev) => prev + 1);
    listFiles(token, targetFolder.id);
  };

  const downloadFile = async (fileId, fileName, mimeType) => {
    try {
      let downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

      if (mimeType.startsWith('application/vnd.google-apps.')) {
        const exportMap = {
          'application/vnd.google-apps.document': 'application/pdf',
          'application/vnd.google-apps.spreadsheet':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.google-apps.presentation':
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        };

        const exportMimeType = exportMap[mimeType];
        if (exportMimeType) {
          downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(
            exportMimeType
          )}`;
        }
      }

      const response = await fetch(downloadUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const blob = await response.blob();
      return { blob, fileName };
    } catch (error) {
      console.error('Download error:', error);
      throw error;
    }
  };

  const uploadToS3 = async (file, fileName) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: true, url: `https://s3.example.com/${fileName}` });
      }, 800);
    });
  };

  const toggleFileCheck = (fileId) => {
    setCheckedFiles((prev) => {
      const newChecked = new Set(prev);
      if (newChecked.has(fileId)) {
        newChecked.delete(fileId);
      } else {
        if (newChecked.size >= 5) {
          alert('Maximum 5 files can be selected');
          return prev;
        }
        newChecked.add(fileId);
      }
      return newChecked;
    });
  };

  const processCheckedFiles = async () => {
    if (checkedFiles.size === 0) {
      alert('Please select at least one file');
      return;
    }

    const filesToProcess = files.filter(
      (f) => checkedFiles.has(f.id) && isDownloadableFile(f.mimeType)
    );

    setIsProcessing(true);
    setProcessingProgress(0);
    setProcessedFiles([]);
    setShowFilePicker(false);

    let processedCount = 0;
    const newProcessedFiles = [];

    for (const file of filesToProcess) {
      try {
        const { blob, fileName } = await downloadFile(
          file.id,
          file.name,
          file.mimeType
        );

        const fileObject = new File([blob], fileName, { type: blob.type });
        await uploadToS3(blob, fileName);

        newProcessedFiles.push({
          id: file.id,
          name: file.name,
          fileName,
          mimeType: file.mimeType,
          size: file.size,
          fileObject,
          status: 'success',
        });

        processedCount++;
      } catch (error) {
        console.error(`Failed to download ${file.name}:`, error);
        newProcessedFiles.push({
          id: file.id,
          name: file.name,
          status: 'error',
          error: error.message,
        });
      }

      setProcessingProgress(
        Math.round((processedCount / filesToProcess.length) * 100)
      );
    }

    setProcessedFiles(newProcessedFiles);
    setIsProcessing(false);
    setCheckedFiles(new Set());
  };

  const openFilePicker = () => {
    if (!token) {
      login();
    } else {
      setShowFilePicker(true);
    }
  };

  const removeFile = (fileId) => {
    setProcessedFiles(processedFiles.filter((f) => f.id !== fileId));
  };

  const downloadFileObject = (file) => {
    if (file.fileObject) {
      const url = URL.createObjectURL(file.fileObject);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const getFileIcon = (mimeType) => {
    if (isFolder(mimeType)) return '📁';
    if (mimeType.includes('image')) return '🖼️';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('sheet') || mimeType.includes('csv')) return '📊';
    if (mimeType.includes('document')) return '📝';
    if (mimeType.includes('presentation')) return '📽️';
    if (mimeType.includes('video')) return '🎥';
    if (mimeType.includes('audio')) return '🎵';
    return '📦';
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className='min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4'>
      <div className='w-full max-w-4xl'>
        {/* Header */}
        <div className='text-center mb-8'>
          <h1 className='text-4xl font-bold text-gray-800 mb-2'>
            <span className='text-blue-600'>📁</span> Google Drive Test Run
          </h1>
          <p className='text-gray-600'>Attach files from Google Drive</p>
        </div>

        {/* Main Input Container */}
        <div className='bg-white rounded-2xl shadow-xl p-6'>
          {/* Processed Files Chips */}
          {processedFiles.length > 0 && (
            <div className='mb-4 flex flex-wrap gap-2'>
              {processedFiles.map((file) => (
                <div
                  key={file.id}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 transition ${
                    file.status === 'success'
                      ? 'bg-green-50 border border-green-200 hover:bg-green-100'
                      : 'bg-red-50 border border-red-200 hover:bg-red-100'
                  }`}
                >
                  <span className='text-lg'>
                    {file.status === 'success'
                      ? getFileIcon(file.mimeType)
                      : '⚠️'}
                  </span>
                  <div className='flex items-center gap-2 min-w-0'>
                    <span className='text-sm font-medium text-gray-800 truncate max-w-xs'>
                      {file.name}
                    </span>
                    {file.status === 'success' && (
                      <button
                        onClick={() => downloadFileObject(file)}
                        className='flex-shrink-0 p-1 text-green-600 hover:text-green-700 hover:bg-green-200 rounded-full transition'
                        title='Download file object'
                      >
                        <Download className='w-4 h-4' />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => removeFile(file.id)}
                    className='flex-shrink-0 p-1 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-full transition'
                  >
                    <X className='w-4 h-4' />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input Box */}
          <div className='relative'>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                }
              }}
              placeholder='Type your message here...'
              className='w-full px-4 py-3 pr-24 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none resize-none transition'
              rows='3'
            />

            {/* Action Buttons */}
            <div className='absolute bottom-3 right-3 flex gap-2'>
              <button
                onClick={openFilePicker}
                className='p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition'
                title='Attach from Google Drive'
              >
                <svg
                  className='w-6 h-6'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13'
                  />
                </svg>
              </button>
            </div>
          </div>

          <p className='text-xs text-gray-500 mt-2'>
            Max 5 files • Supported formats: images, documents, spreadsheets,
            and more
          </p>
        </div>
      </div>

      {/* Processing Modal */}
      {isProcessing && (
        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'>
          <div className='bg-white rounded-2xl shadow-2xl w-full max-w-md p-8'>
            <div className='flex flex-col items-center justify-center'>
              <div className='relative w-24 h-24 mb-6'>
                <div className='absolute inset-0 rounded-full border-4 border-gray-200'></div>
                <div
                  className='absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent transition-transform'
                  style={{
                    transform: 'rotate(360deg)',
                    animation: 'spin 1s linear infinite',
                  }}
                ></div>
                <div className='absolute inset-0 flex items-center justify-center text-3xl'>
                  ⏳
                </div>
              </div>

              <h3 className='text-xl font-bold text-gray-800 mb-2'>
                Processing Files
              </h3>
              <p className='text-gray-600 text-center mb-6'>
                Processing for file object conversion...
              </p>

              {/* Progress Bar */}
              <div className='w-full mb-4'>
                <div className='h-2 bg-gray-200 rounded-full overflow-hidden'>
                  <div
                    className='h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300'
                    style={{ width: `${processingProgress}%` }}
                  ></div>
                </div>
              </div>

              <p className='text-sm text-gray-500 text-center'>
                {processingProgress}% Complete
              </p>
            </div>

            <style>{`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        </div>
      )}

      {/* File Picker Modal */}
      {showFilePicker && (
        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-40'>
          <div className='bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col'>
            {/* Modal Header */}
            <div className='flex items-center justify-between p-6 border-b border-gray-200'>
              <div>
                <h2 className='text-2xl font-bold text-gray-800'>
                  Select from Google Drive
                </h2>
                <p className='text-sm text-gray-500 mt-1'>
                  Check files to select • Maximum 5 files • Click folders to
                  navigate
                </p>
              </div>
              <button
                onClick={() => setShowFilePicker(false)}
                className='text-gray-400 hover:text-gray-600 transition'
              >
                <X className='w-6 h-6' />
              </button>
            </div>

            {/* Breadcrumb Navigation */}
            <div className='flex items-center gap-2 px-6 py-4 border-b border-gray-200 bg-gray-50 overflow-x-auto'>
              {folderStack.map((folder, index) => (
                <React.Fragment key={folder.id}>
                  <button
                    onClick={() => goToFolder(index)}
                    className='text-sm text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap'
                  >
                    {folder.name}
                  </button>
                  {index < folderStack.length - 1 && (
                    <span className='text-gray-400'>/</span>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Modal Content */}
            <div className='flex-1 overflow-y-auto p-6'>
              {isLoading ? (
                <div className='text-center py-12'>
                  <Loader className='w-12 h-12 text-blue-600 animate-spin mx-auto mb-3' />
                  <p className='text-gray-500'>Loading your files...</p>
                </div>
              ) : (
                <div className='space-y-2'>
                  {files.length === 0 ? (
                    <div className='text-center py-12'>
                      <p className='text-gray-500'>This folder is empty</p>
                    </div>
                  ) : (
                    files.map((file) => {
                      const isDownloadable = isDownloadableFile(file.mimeType);
                      const isDir = isFolder(file.mimeType);
                      const isChecked = checkedFiles.has(file.id);

                      return (
                        <div
                          key={`folder-${currentFolderId}-file-${file.id}-${uniqueFileKey}`}
                          className={`flex items-center gap-3 border-2 rounded-lg p-4 transition-all duration-200 ${
                            isDir
                              ? 'border-blue-300 hover:border-blue-500 hover:bg-blue-50'
                              : isDownloadable
                              ? isChecked
                                ? 'border-green-500 bg-green-50'
                                : 'border-gray-200 hover:border-blue-500 hover:bg-blue-50'
                              : 'border-gray-100 bg-gray-50 opacity-60'
                          }`}
                        >
                          {!isDir && (
                            <input
                              type='checkbox'
                              checked={isChecked}
                              onChange={() => {
                                if (isDownloadable) {
                                  toggleFileCheck(file.id);
                                }
                              }}
                              disabled={!isDownloadable}
                              className='w-4 h-4 cursor-pointer'
                            />
                          )}
                          <div
                            onClick={() => {
                              if (isDir) {
                                openFolder(file.id, file.name);
                              }
                            }}
                            className={`flex-1 flex items-center gap-3 ${
                              isDir ? 'cursor-pointer' : ''
                            }`}
                          >
                            <span className='text-2xl'>
                              {getFileIcon(file.mimeType)}
                            </span>
                            <div className='flex-1 min-w-0'>
                              <h3
                                className={`font-medium truncate text-sm ${
                                  isDir
                                    ? 'text-blue-600 hover:text-blue-700'
                                    : isDownloadable
                                    ? isChecked
                                      ? 'text-green-700'
                                      : 'text-gray-800'
                                    : 'text-gray-500'
                                }`}
                                title={file.name}
                              >
                                {file.name}
                              </h3>
                              <p className='text-xs text-gray-500 mt-0.5'>
                                {isDir ? 'Folder' : formatFileSize(file.size)}
                              </p>
                              {!isDownloadable && !isDir && (
                                <p className='text-xs text-red-500 mt-0.5'>
                                  Cannot download
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className='flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50'>
              <div className='flex items-center gap-4'>
                {folderStack.length > 1 && (
                  <button
                    onClick={goBackFolder}
                    className='flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition'
                  >
                    <svg
                      className='w-5 h-5'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M15 19l-7-7 7-7'
                      />
                    </svg>
                    Go Back
                  </button>
                )}
                <span className='text-sm text-gray-600 font-medium'>
                  Selected: {checkedFiles.size}/5
                </span>
              </div>
              <button
                onClick={processCheckedFiles}
                disabled={checkedFiles.size === 0}
                className='px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium'
              >
                Process {checkedFiles.size > 0 ? `(${checkedFiles.size})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GoogleDriveViewer;
