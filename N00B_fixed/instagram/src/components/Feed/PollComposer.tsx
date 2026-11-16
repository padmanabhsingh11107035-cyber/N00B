import React from 'react';
import '../Fun/fun.css';
import { CreateForm } from '../Fun/PollsPage';
import { useToast } from '../Fun/funUi';
import { announceMixItem } from './HomeMix';

// Making a poll, opened from the Create sheet. It is the same form the Polls page had; the new poll goes straight onto the Home page. A poll is never anonymous.
const PollComposer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { say, toast } = useToast();
  return (
    <div className="fx-root" data-fx="polls" data-noob-keep="1" data-testid="poll-composer">
      <CreateForm onCancel={onClose} onCreated={(p) => { announceMixItem({ kind: 'poll', at: p.createdAt, poll: p }); onClose(); }} say={say} />
      {toast}
    </div>
  );
};
export default PollComposer;
