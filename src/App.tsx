import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Square, Download, Clock, Users, AlertCircle, CheckCircle, FileText, Smartphone, Wifi, Battery } from 'lucide-react';

interface ProfileResult {
  username: string;
  post_date: string;
  error: boolean;
  processed?: boolean;
}

interface ProgressData {
  current: number;
  total: number;
  percentage: number;
  estimatedTime?: string;
}

function App() {
  const [usernames, setUsernames] = useState<string[]>([]);
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressData>({ current: 0, total: 0, percentage: 0 });
  const [fileName, setFileName] = useState('');
  const [minDelay, setMinDelay] = useState(5);
  const [maxDelay, setMaxDelay] = useState(7);
  const [resumeSession, setResumeSession] = useState(true);
  const [status, setStatus] = useState('Ready to start. Upload a file with usernames.');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    // Check for previous session on component mount
    checkPreviousSession();
    
    // Add mobile viewport meta tag if not present
    const viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      const meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
      document.head.appendChild(meta);
    }
  }, []);

  const checkPreviousSession = async () => {
    try {
      const savedProgress = localStorage.getItem('instagram_scraper_progress');
      const savedResults = localStorage.getItem('instagram_scraper_results');
      
      if (savedProgress && savedResults) {
        const progressData = JSON.parse(savedProgress);
        const resultsData = JSON.parse(savedResults);
        
        if (progressData.total > 0 && progressData.current > 0) {
          setResults(resultsData);
          setProgress(progressData);
          setStatus(`Previous session found: ${progressData.current}/${progressData.total} processed. Upload file to resume.`);
        }
      }
    } catch (error) {
      console.error('Error checking previous session:', error);
    }
  };

  const saveProgress = () => {
    try {
      localStorage.setItem('instagram_scraper_progress', JSON.stringify(progress));
      localStorage.setItem('instagram_scraper_results', JSON.stringify(results));
    } catch (error) {
      console.error('Error saving progress:', error);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'text/csv' || file.type === 'text/plain' || file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
        processFile(file);
      } else {
        setStatus('Please upload a CSV or TXT file.');
      }
    }
  };

  const processFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const content = e.target?.result as string;
      let extractedUsernames: string[] = [];

      if (file.name.endsWith('.csv')) {
        const lines = content.split('\n');
        extractedUsernames = lines
          .map(line => line.split(',')[0].trim())
          .filter(username => username && username.length > 0);
      } else {
        extractedUsernames = content
          .split('\n')
          .map(line => line.trim())
          .filter(username => username && username.length > 0);
      }

      if (extractedUsernames.length > 0) {
        setUsernames(extractedUsernames);
        setProgress({ current: 0, total: extractedUsernames.length, percentage: 0 });
        setStatus(`Loaded ${extractedUsernames.length} usernames.`);
      } else {
        setStatus('No valid usernames found in file.');
      }
    };

    reader.readAsText(file);
  };
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processFile(file);
  };


  const calculateEstimatedTime = (current: number, total: number) => {
    if (!startTime || current === 0) return '';
    
    const elapsedTime = (Date.now() - startTime) / 1000;
    const avgTimePerRequest = elapsedTime / current;
    const remaining = total - current;
    const estimatedSeconds = remaining * avgTimePerRequest;
    
    const hours = Math.floor(estimatedSeconds / 3600);
    const minutes = Math.floor((estimatedSeconds % 3600) / 60);
    const seconds = Math.floor(estimatedSeconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const processUsername = async (username: string, signal: AbortSignal): Promise<ProfileResult> => {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-scraper`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ username }),
        signal
      });

      const data = await response.json();
      
      if (!response.ok) {
        return {
          username,
          post_date: `Error: ${data.error || 'API Error'}`,
          error: true,
          processed: true
        };
      }

      return {
        username,
        post_date: data.post_date || 'N/A',
        error: data.error || false,
        processed: true
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw error;
      }
      
      return {
        username,
        post_date: `Error: ${error.message}`,
        error: true,
        processed: true
      };
    }
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const startVerification = async () => {
    if (usernames.length === 0) {
      alert('No usernames to check');
      return;
    }

    if (minDelay > maxDelay) {
      alert('Min delay cannot be greater than max delay.');
      return;
    }

    const controller = new AbortController();
    setAbortController(controller);
    setIsProcessing(true);
    setStartTime(Date.now());
    
    if (!resumeSession) {
      setResults([]);
      setProgress({ current: 0, total: usernames.length, percentage: 0 });
      localStorage.removeItem('instagram_scraper_progress');
      localStorage.removeItem('instagram_scraper_results');
    }

    const startIndex = resumeSession ? progress.current : 0;
    const newResults = [...results];

    try {
      for (let i = startIndex; i < usernames.length; i++) {
        if (controller.signal.aborted) {
          break;
        }

        const username = usernames[i];
        setStatus(`Processing: ${username} (${i + 1}/${usernames.length})`);

        const result = await processUsername(username, controller.signal);
        newResults.push(result);
        setResults([...newResults]);

        const currentProgress = {
          current: i + 1,
          total: usernames.length,
          percentage: Math.round(((i + 1) / usernames.length) * 100),
          estimatedTime: calculateEstimatedTime(i + 1, usernames.length)
        };
        setProgress(currentProgress);

        // Save progress every 10 items
        if ((i + 1) % 10 === 0) {
          localStorage.setItem('instagram_scraper_progress', JSON.stringify(currentProgress));
          localStorage.setItem('instagram_scraper_results', JSON.stringify(newResults));
        }

        // Add random delay between requests
        if (i < usernames.length - 1) {
          const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
          await sleep(delay * 1000);
        }
      }

      if (!controller.signal.aborted) {
        setStatus(`Completed: ${newResults.length} profiles checked.`);
        localStorage.removeItem('instagram_scraper_progress');
        localStorage.removeItem('instagram_scraper_results');
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        setStatus(`Error: ${error.message}`);
      }
    } finally {
      setIsProcessing(false);
      setAbortController(null);
    }
  };

  const stopVerification = () => {
    if (abortController) {
      abortController.abort();
      setStatus('Stopping...');
      saveProgress();
    }
  };

  const exportResults = () => {
    if (results.length === 0) {
      alert('No results to export');
      return;
    }

    const csvContent = [
      ['Username', 'Post Date'].join(','),
      ...results.map(result => [result.username, result.post_date].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `instagram_results_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-safe">
      {/* Header */}
      <div className="bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white p-4 md:p-6 sticky top-0 z-10 shadow-lg">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Smartphone className="w-6 h-6" />
            <span className="text-sm opacity-90">Mobile Optimized</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">
            Instagram Profile Post Date Checker
          </h1>
          <p className="text-sm md:text-base opacity-90">
            Check the latest post dates of Instagram profiles
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        {/* Input Settings */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Input Settings
          </h2>
          
          {/* File Upload */}
          <div className="space-y-4">
            <div 
              className={`border-2 border-dashed rounded-lg p-4 md:p-6 text-center transition-all duration-200 ${
                isDragOver 
                  ? 'border-pink-500 bg-pink-50' 
                  : 'border-gray-300 hover:border-pink-400'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full touch-manipulation"
              >
                <FileText className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                <p className="text-sm md:text-base text-gray-600">
                  {fileName ? fileName : 'Click to select CSV or TXT file'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Supports CSV and TXT files with Instagram usernames
                </p>
              </button>
            </div>

            {/* Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="resume"
                  checked={resumeSession}
                  onChange={(e) => setResumeSession(e.target.checked)}
                  className="rounded border-gray-300 text-pink-600 focus:ring-pink-500 w-4 h-4"
                />
                <label htmlFor="resume" className="text-sm font-medium select-none">
                  Resume session
                </label>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Min. Delay (s)
                </label>
                <input
                  type="number"
                  value={minDelay}
                  onChange={(e) => setMinDelay(parseInt(e.target.value))}
                  min="1"
                  max="120"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 text-base"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Max. Delay (s)
                </label>
                <input
                  type="number"
                  value={maxDelay}
                  onChange={(e) => setMaxDelay(parseInt(e.target.value))}
                  min="1"
                  max="120"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 text-base"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            <button
              onClick={startVerification}
              disabled={usernames.length === 0 || isProcessing}
              className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 md:px-6 py-3 rounded-lg font-medium transition-colors touch-manipulation text-sm md:text-base"
            >
              <Play className="w-4 h-4" />
              Start Checking
            </button>

            <button
              onClick={stopVerification}
              disabled={!isProcessing}
              className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-4 md:px-6 py-3 rounded-lg font-medium transition-colors touch-manipulation text-sm md:text-base"
            >
              <Square className="w-4 h-4" />
              Stop Checking
            </button>

            <button
              onClick={exportResults}
              disabled={results.length === 0}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 md:px-6 py-3 rounded-lg font-medium transition-colors touch-manipulation text-sm md:text-base sm:col-span-2 lg:col-span-1"
            >
              <Download className="w-4 h-4" />
              Export Results
            </button>
          </div>
        </div>

        {/* Progress */}
        {progress.total > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-5 h-5 text-pink-600" />
              <span className="font-medium text-sm md:text-base">
                Progress: {progress.current}/{progress.total} ({progress.percentage}%)
              </span>
            </div>
            
            <div className="w-full bg-gray-200 rounded-full h-2 md:h-3 mb-4">
              <div 
                className="bg-gradient-to-r from-pink-500 to-red-500 h-2 md:h-3 rounded-full transition-all duration-300"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            
            {progress.estimatedTime && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="w-4 h-4" />
                Estimated time remaining: {progress.estimatedTime}
              </div>
            )}
          </div>
        )}

        {/* Status */}
        <div className="bg-white rounded-xl shadow-lg p-4">
          <div className="flex items-center gap-2 text-gray-700">
            <AlertCircle className="w-5 h-5" />
            <span className="break-words">{status}</span>
          </div>
        </div>

        {/* Results Table */}
        {results.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="p-6 border-b">
              <h2 className="text-lg md:text-xl font-semibold">Profile Information Results ({results.length})</h2>
            </div>
            
            <div className="overflow-x-auto max-h-96 md:max-h-none">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-2 md:py-3 px-3 md:px-6 font-medium text-gray-900 text-sm md:text-base">Username</th>
                    <th className="text-left py-2 md:py-3 px-3 md:px-6 font-medium text-gray-900 text-sm md:text-base">Posted Date</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, index) => (
                    <tr key={index} className="border-t hover:bg-gray-50">
                      <td className="py-2 md:py-3 px-3 md:px-6 font-medium text-sm md:text-base break-all">{result.username}</td>
                      <td className={`py-2 md:py-3 px-3 md:px-6 text-sm md:text-base ${result.error ? 'text-red-600 bg-red-50' : 'text-gray-900'}`}>
                        <div className="flex items-center gap-2">
                          {result.error ? (
                            <AlertCircle className="w-4 h-4" />
                          ) : (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          )}
                          <span className="break-words">{result.post_date}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {/* Mobile-specific footer */}
        <div className="md:hidden bg-white rounded-xl shadow-lg p-4 text-center">
          <div className="flex items-center justify-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Wifi className="w-4 h-4" />
              <span>Online</span>
            </div>
            <div className="flex items-center gap-1">
              <Battery className="w-4 h-4" />
              <span>Optimized</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;