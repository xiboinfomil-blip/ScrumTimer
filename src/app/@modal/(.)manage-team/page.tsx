import { ManageTeamPage } from '@/app/manage-team/_components/manage-team-page';
import { ManageTeamModal } from './manage-team-modal';

export default function InterceptedManageTeamPage() {
  return <ManageTeamModal><ManageTeamPage modal /></ManageTeamModal>;
}