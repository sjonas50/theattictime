import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Check, X, Edit3, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tables } from '@/integrations/supabase/types';

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

interface VoiceAnalysisReviewProps {
  analysis: Analysis;
  projectCodes: Tables<'project_codes'>[];
  onCreateEntries: (entries: AnalysisEntry[]) => Promise<void>;
  onCancel: () => void;
}

const VoiceAnalysisReview: React.FC<VoiceAnalysisReviewProps> = ({
  analysis,
  projectCodes,
  onCreateEntries,
  onCancel
}) => {
  const [editedEntries, setEditedEntries] = useState<AnalysisEntry[]>(analysis.entries);
  const [isCreating, setIsCreating] = useState(false);

  const updateEntry = (index: number, field: keyof AnalysisEntry, value: any) => {
    const updated = [...editedEntries];
    updated[index] = { ...updated[index], [field]: value };
    setEditedEntries(updated);
  };

  const removeEntry = (index: number) => {
    const updated = editedEntries.filter((_, i) => i !== index);
    setEditedEntries(updated);
  };

  const addEntry = () => {
    const newEntry: AnalysisEntry = {
      project_code: '',
      hours_worked: 0,
      entry_date: new Date().toISOString().split('T')[0],
      notes: '',
      confidence: 1.0
    };
    setEditedEntries([...editedEntries, newEntry]);
  };

  const handleCreateEntries = async () => {
    // Validate entries
    const validEntries = editedEntries.filter(entry => 
      entry.project_code && 
      entry.project_code !== 'UNKNOWN' && 
      entry.hours_worked > 0
    );

    if (validEntries.length === 0) {
      toast.error('Please ensure at least one entry has a valid project code and hours');
      return;
    }

    const invalidEntries = editedEntries.filter(entry => 
      !entry.project_code || entry.project_code === 'UNKNOWN' || entry.hours_worked <= 0
    );

    if (invalidEntries.length > 0) {
      toast.error(`${invalidEntries.length} entries will be skipped due to missing or invalid data`);
    }

    setIsCreating(true);
    try {
      await onCreateEntries(validEntries);
      toast.success(`Successfully created ${validEntries.length} time entries`);
    } catch (error) {
      console.error('Error creating entries:', error);
      toast.error('Failed to create time entries');
    } finally {
      setIsCreating(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getTotalHours = () => {
    return editedEntries.reduce((sum, entry) => sum + entry.hours_worked, 0);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Edit3 className="h-5 w-5" />
          Review & Edit Time Entries
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary */}
        <div className="p-4 bg-blue-50 rounded-lg">
          <h4 className="font-medium mb-2">AI Analysis Summary:</h4>
          <p className="text-sm text-blue-800 mb-2">{analysis.summary}</p>
          <div className="flex items-center justify-between text-sm">
            <span>Original Total: {analysis.total_hours} hours</span>
            <span>Current Total: {getTotalHours()} hours</span>
          </div>
        </div>

        {/* Entries */}
        <div className="space-y-4">
          {editedEntries.map((entry, index) => (
            <div key={index} className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <h5 className="font-medium">Entry {index + 1}</h5>
                <div className="flex items-center gap-2">
                  <Badge className={getConfidenceColor(entry.confidence)}>
                    {Math.round(entry.confidence * 100)}% confidence
                  </Badge>
                  <Button
                    onClick={() => removeEntry(index)}
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium">Project Code</label>
                  <Select
                    value={entry.project_code}
                    onValueChange={(value) => updateEntry(index, 'project_code', value)}
                  >
                    <SelectTrigger className={entry.project_code === 'UNKNOWN' ? 'border-orange-300' : ''}>
                      <SelectValue placeholder="Select project code" />
                    </SelectTrigger>
                    <SelectContent>
                      {projectCodes.map((pc) => (
                        <SelectItem key={pc.id} value={pc.code}>
                          {pc.name ? `${pc.code} - ${pc.name}` : pc.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {entry.project_code === 'UNKNOWN' && (
                    <div className="flex items-center gap-1 text-orange-600 text-xs mt-1">
                      <AlertTriangle className="h-3 w-3" />
                      Please select a valid project code
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium">Hours Worked</label>
                  <Input
                    type="number"
                    step="0.25"
                    min="0"
                    max="24"
                    value={entry.hours_worked}
                    onChange={(e) => updateEntry(index, 'hours_worked', parseFloat(e.target.value) || 0)}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Date</label>
                  <Input
                    type="date"
                    value={entry.entry_date}
                    onChange={(e) => updateEntry(index, 'entry_date', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Notes</label>
                <Textarea
                  value={entry.notes}
                  onChange={(e) => updateEntry(index, 'notes', e.target.value)}
                  placeholder="Description of work performed"
                  rows={2}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Add Entry Button */}
        <Button onClick={addEntry} variant="outline" className="w-full">
          Add Another Entry
        </Button>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <Button
            onClick={handleCreateEntries}
            disabled={isCreating || editedEntries.length === 0}
            className="flex-1"
          >
            {isCreating ? 'Creating...' : `Create ${editedEntries.filter(e => e.project_code && e.project_code !== 'UNKNOWN' && e.hours_worked > 0).length} Time Entries`}
          </Button>
          <Button onClick={onCancel} variant="outline">
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default VoiceAnalysisReview;