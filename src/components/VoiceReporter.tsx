import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Mic, MicOff, Square, Play, Loader2, Check, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface VoiceReporterProps {
  employeeId: string;
  onAnalysisComplete: (analysis: any) => void;
}

interface AnalysisEntry {
  project_code: string;
  hours_worked: number;
  entry_date: string;
  notes: string;
  confidence: number;
}

interface Analysis {
  entries: AnalysisEntry[];
  summary: string;
  total_hours: number;
}

const VoiceReporter: React.FC<VoiceReporterProps> = ({ employeeId, onAnalysisComplete }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [transcription, setTranscription] = useState<string>('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [processingStep, setProcessingStep] = useState<'transcribing' | 'analyzing' | 'complete'>('transcribing');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setRecordingDuration(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      toast.success('Recording started. Describe your daily work activities.');
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to start recording. Please check microphone permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const playRecording = () => {
    if (recordedBlob) {
      const audioUrl = URL.createObjectURL(recordedBlob);
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.play();
      }
    }
  };

  const processRecording = async () => {
    if (!recordedBlob) {
      toast.error('No recording found');
      return;
    }

    setIsProcessing(true);
    setProcessingStep('transcribing');

    try {
      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(recordedBlob);
      
      reader.onloadend = async () => {
        const base64Audio = reader.result?.toString().split(',')[1];
        
        if (!base64Audio) {
          throw new Error('Failed to convert audio to base64');
        }

        // Step 1: Transcribe audio
        console.log('Starting transcription...');
        const transcriptionResponse = await supabase.functions.invoke('voice-transcription', {
          body: {
            audioData: base64Audio,
            employeeId: employeeId,
            duration: recordingDuration
          }
        });

        if (transcriptionResponse.error) {
          throw new Error(transcriptionResponse.error.message || 'Transcription failed');
        }

        const { voiceReportId, transcription: transcribedText } = transcriptionResponse.data;
        setTranscription(transcribedText);
        
        // Step 2: Analyze transcription
        setProcessingStep('analyzing');
        console.log('Starting AI analysis...');
        
        const analysisResponse = await supabase.functions.invoke('analyze-work-summary', {
          body: {
            voiceReportId: voiceReportId,
            transcription: transcribedText
          }
        });

        if (analysisResponse.error) {
          throw new Error(analysisResponse.error.message || 'Analysis failed');
        }

        const { analysis: analysisData } = analysisResponse.data;
        setAnalysis(analysisData);
        setProcessingStep('complete');
        
        // Call the callback with the analysis
        onAnalysisComplete(analysisData);

        toast.success('Voice report processed successfully!');
      };

    } catch (error) {
      console.error('Error processing recording:', error);
      toast.error(`Processing failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetRecording = () => {
    setRecordedBlob(null);
    setTranscription('');
    setAnalysis(null);
    setRecordingDuration(0);
    setProcessingStep('transcribing');
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="h-5 w-5" />
          Voice Daily Report
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Recording Controls */}
        <div className="flex items-center gap-4">
          {!isRecording && !recordedBlob && (
            <Button onClick={startRecording} className="flex items-center gap-2">
              <Mic className="h-4 w-4" />
              Start Recording
            </Button>
          )}
          
          {isRecording && (
            <>
              <Button onClick={stopRecording} variant="destructive" className="flex items-center gap-2">
                <Square className="h-4 w-4" />
                Stop Recording
              </Button>
              <Badge variant="outline" className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                {formatDuration(recordingDuration)}
              </Badge>
            </>
          )}
          
          {recordedBlob && !isProcessing && (
            <>
              <Button onClick={playRecording} variant="outline" className="flex items-center gap-2">
                <Play className="h-4 w-4" />
                Play Recording
              </Button>
              <Button onClick={processRecording} className="flex items-center gap-2">
                <Check className="h-4 w-4" />
                Process Recording
              </Button>
              <Button onClick={resetRecording} variant="outline">
                Reset
              </Button>
              <Badge variant="outline">
                Duration: {formatDuration(recordingDuration)}
              </Badge>
            </>
          )}
        </div>

        {/* Processing Status */}
        {isProcessing && (
          <div className="flex items-center gap-2 p-4 bg-blue-50 rounded-lg">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>
              {processingStep === 'transcribing' && 'Transcribing audio...'}
              {processingStep === 'analyzing' && 'Analyzing work summary...'}
            </span>
          </div>
        )}

        {/* Transcription */}
        {transcription && (
          <div className="space-y-2">
            <h4 className="font-medium">Transcription:</h4>
            <div className="p-3 bg-gray-50 rounded-lg text-sm">
              {transcription}
            </div>
          </div>
        )}

        {/* Analysis Results */}
        {analysis && (
          <div className="space-y-4">
            <h4 className="font-medium">AI Analysis:</h4>
            
            <div className="p-3 bg-green-50 rounded-lg">
              <p className="text-sm text-green-800">{analysis.summary}</p>
              <p className="text-sm font-medium text-green-900 mt-2">
                Total Hours: {analysis.total_hours}
              </p>
            </div>

            <div className="space-y-2">
              <h5 className="font-medium text-sm">Extracted Time Entries:</h5>
              {analysis.entries.map((entry, index) => (
                <div key={index} className="p-3 border rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{entry.project_code}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{entry.hours_worked}h</Badge>
                      <Badge className={getConfidenceColor(entry.confidence)}>
                        {Math.round(entry.confidence * 100)}% confidence
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">{entry.notes}</p>
                  <p className="text-xs text-gray-500">Date: {entry.entry_date}</p>
                  {entry.project_code === 'UNKNOWN' && (
                    <div className="flex items-center gap-2 text-orange-600 text-sm">
                      <AlertCircle className="h-4 w-4" />
                      Could not match to existing project code
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <audio ref={audioRef} style={{ display: 'none' }} />
      </CardContent>
    </Card>
  );
};

export default VoiceReporter;