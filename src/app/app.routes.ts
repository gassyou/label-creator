import { Routes } from '@angular/router';
import { EditorComponent } from './editor/editor';
import { TemplateListComponent } from './template/template-list/template-list';

export const routes: Routes = [
  { path: '', component: TemplateListComponent },
  { path: 'editor', component: EditorComponent },
  { path: 'editor/:id', component: EditorComponent }
];