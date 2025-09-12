-- Create voice_reports table to store transcriptions and AI analysis
CREATE TABLE public.voice_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL,
  audio_duration_seconds INTEGER,
  transcription TEXT,
  ai_analysis JSONB,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.voice_reports ENABLE ROW LEVEL SECURITY;

-- Create policies for voice reports
CREATE POLICY "Employees can manage their own voice reports" 
ON public.voice_reports 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM employees e 
  WHERE e.id = voice_reports.employee_id 
  AND e.user_id = auth.uid()
));

CREATE POLICY "Admins can view all voice reports" 
ON public.voice_reports 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supervisors can view all voice reports" 
ON public.voice_reports 
FOR SELECT 
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Create junction table to link voice reports to generated time entries
CREATE TABLE public.voice_report_time_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  voice_report_id UUID NOT NULL,
  time_entry_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.voice_report_time_entries ENABLE ROW LEVEL SECURITY;

-- Create policies for junction table
CREATE POLICY "Employees can view their own voice report entries" 
ON public.voice_report_time_entries 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM voice_reports vr 
  JOIN employees e ON e.id = vr.employee_id 
  WHERE vr.id = voice_report_time_entries.voice_report_id 
  AND e.user_id = auth.uid()
));

CREATE POLICY "Admins can view all voice report entries" 
ON public.voice_report_time_entries 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add foreign key constraints
ALTER TABLE public.voice_reports 
ADD CONSTRAINT voice_reports_employee_id_fkey 
FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

ALTER TABLE public.voice_report_time_entries 
ADD CONSTRAINT voice_report_time_entries_voice_report_id_fkey 
FOREIGN KEY (voice_report_id) REFERENCES public.voice_reports(id) ON DELETE CASCADE;

ALTER TABLE public.voice_report_time_entries 
ADD CONSTRAINT voice_report_time_entries_time_entry_id_fkey 
FOREIGN KEY (time_entry_id) REFERENCES public.time_entries(id) ON DELETE CASCADE;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_voice_reports_updated_at
BEFORE UPDATE ON public.voice_reports
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();