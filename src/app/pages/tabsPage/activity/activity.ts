import { Component, ViewChild, OnInit } from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular';
import { Router, NavigationExtras } from '@angular/router';
import { from, Observable } from 'rxjs';
import { share, map } from 'rxjs/operators';

// MODELS
import { ActivityM } from './../../../models/activity.model';
import { AppConfig } from '../../../../app.config';
import { ScrollHideConfig } from './../../../components/parallax/parallax.directive';

// COMPONENTS - PAGES
import { OptionsComponent } from './options/options';

// SERVICES
import { SecuredStorageService } from '../../../services/securedStorage.service';
import { TransactionService } from '../../../services/transaction-service';
import { ToastService } from '../../../services/toast-service';
import { ActivitiesService } from '../../../services/activities.service';
import { Web3Service } from '../../../services/web3-service';
import { CredentialDetailPage } from '../../credential-detail/credential-detail';
import { LoadingService } from '../../../services/loading-service';

@Component({
    templateUrl: 'activity.html',
    providers: [ToastService],
    styleUrls: ['/activity.scss']
})

export class ActivityPage {

    @ViewChild(OptionsComponent, {read: '', static: false})
    public optionsComponent: OptionsComponent;
    public web3: any;
    public activities: Observable<Array<ActivityM>>;
    public searchTerm: string;
    public type: string;
    public activitiesSelected: Array<any> = new Array<any>();
    public selection = false;
    headerScrollConfig: ScrollHideConfig = { cssProperty: 'margin-top', maxValue: 80 };

    constructor(private toastCtrl: ToastService,
                private activitiesService: ActivitiesService,
                private securedStrg: SecuredStorageService,
                private transactionSrv: TransactionService,
                private loadingSrv: LoadingService,
                private router: Router,
                public alertCtrl: AlertController,
                public web3Srv: Web3Service,
                public modalCtrl: ModalController
            ) {
        this.type = AppConfig.CREDENTIAL_TYPE;
        this.web3 = this.web3Srv.getWeb3(AppConfig.nodeURL);
    }

    ionViewWillEnter() {
        console.log('------- ionViewWillEnter --------');
        this.activities = from(this.getActivities()).pipe(share());
    }

    /**
     * Function for get activities
     */
   public getActivities() {
        let prefix: string;
        if (this.type === AppConfig.CREDENTIAL_TYPE) {
            prefix = AppConfig.CREDENTIAL_PREFIX;
        } else {
            prefix = AppConfig.PRESENTATION_PREFIX;
        }

        return this.securedStrg.matchAndGetJSON(prefix)
            .then(async (elements) => {
                let count = 0;
                const promises = [];
                const did = await this.securedStrg.get('userDID');
                elements.map(async (element: any) => {
                    const elementObj = JSON.parse(element);
                    const key = this.getCreedKey(elementObj);

                    if (prefix === AppConfig.CREDENTIAL_PREFIX) {
                        promises.push(this.getCredentialStatus(this.web3, elementObj[AppConfig.PSM_HASH], did)
                            .then((credentialStatus) => {
                                const statusType = parseInt(credentialStatus[1], 0);

                                return this.createActivityObject(count++, key, elementObj[key], elementObj.entityName, elementObj.iat,
                                    statusType, elementObj[AppConfig.REMOVE_KEY]);
                            }));
                    } else {
                        const iat = new Date(elementObj[AppConfig.PAYLOAD][AppConfig.NBF]);
                        const iatString = iat.getDate() + '/' + (iat.getMonth() + 1) + '/' + iat.getFullYear();

                        promises.push(this.getPresentationStatus(this.web3, elementObj[AppConfig.PSM_HASH], did)
                        .then(async (credentialStatus) => {
                            const title = `${elementObj[AppConfig.PAYLOAD][AppConfig.JTI]}`;
                            // const title = "Presentación " + count++;
                            const statusType = parseInt(credentialStatus[1], 0);
                            const entityName = await this.transactionSrv.getEntity(this.web3,
                                elementObj[AppConfig.PAYLOAD][AppConfig.AUDIENCE]);

                            return this.createActivityObject(count++, title, '', entityName.name,
                                iatString, statusType, elementObj[AppConfig.REMOVE_KEY]);
                        }));
                    }
                });

                return Promise.all(promises);
            });
    }
    private getCreedKey(credential: any) {
        let key = '';
        Object.keys(credential).map((keyCredential) => {
            if (keyCredential !== 'levelOfAssurance' && keyCredential !== 'iat' && keyCredential !== 'exp' && keyCredential !== 'iss' &&
            keyCredential !== 'entityName' && keyCredential !== 'PSMHash' && keyCredential !== 'removeKey' && keyCredential !== 'nbf' &&
            keyCredential !== 'credentialJWT' && keyCredential !== 'sub') {
                key = keyCredential;
            }
        });

        return key;
    }

    /**
     * Go item click
     * @param  item - activity selected
     */
    async onItemClick(item: any) {
        if (item.type === AppConfig.PRESENTATION_TYPE) {
            const presentation = await this.securedStrg.getJSON(item.removeKey);

            let entityName;
            if (presentation[AppConfig.PAYLOAD][AppConfig.AUDIENCE]) {
                const issuer = presentation[AppConfig.PAYLOAD][AppConfig.AUDIENCE];
                const entity = await this.transactionSrv.getEntity(this.web3, issuer);
                entityName = entity.name;
            } else {
                entityName = presentation.entityName;
            }
            const iatString = this.parseFormatDate(presentation[AppConfig.PAYLOAD][AppConfig.NBF]);
            const expString = this.parseFormatDate(presentation[AppConfig.PAYLOAD][AppConfig.EXP]);
            const credentialRes = this.parseCredential(0, item.title, entityName, iatString,
            expString, entityName, 3, this.createStars(3), true);

            // Send credentialRes to creadential detail.
            const navigationExtras: NavigationExtras = {
                state: {
                    item: credentialRes, showDeleteAndShare: true,
                    isRevoked: item.status == AppConfig.ActivityStatus.Revoked || item.status == AppConfig.ActivityStatus.DeletedBySubject
                }
            };
            this.router.navigate(['/', 'credentialDetail', navigationExtras]);
        } else {
            this.toastCtrl.presentToast('Folow');
        }
    }

    async getEntity(web3: any, issuer: string) {
        const entity = await this.transactionSrv.getEntity(web3, issuer);
        return entity.name;
    }

    /**
     * Search activities fake
     * @param event - *
     * @param item - *
     */
    async onSearch(event?: any) {
        let searchTerm = this.searchTerm;
        if (event) {
            searchTerm = event.target.value;
        }

        try {
            this.activities = from(this.getActivities()).pipe(map((activities) => {
                if (searchTerm) {
                    return activities.filter(activity => {
                        if (activity.description.toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1
                            || activity.subtitle.toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1
                            || activity.title.toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1) {
                            return activity;
                        }
                    });
                } else  {
                    return activities;
                }
            }));
        } catch (err) {
            console.error(err);
        }
    }

    private parseFormatDate(date: any): string {
        let result = '';
        if (date) {
            const newDate = new Date(date);
            result = newDate.getDate() + '/' + (newDate.getMonth() + 1) + '/' + newDate.getFullYear();
        }

        return result;
    }

    private parseCredential(id: number, title: string, value: any, addDate: string, endDate: string,
                            issuer: string, level: number, stars: Array<any>, credentialAssigned: boolean) {
        return {
            id,
            titleP: (title) ? title.toUpperCase().replace(/_/g, ' ') : '',
            emitter: 'Emisor del testimonio',
            valueT: 'Valor',
            value: (value) ? value : 'Credencial no selecionada o no disponible',
            place: 'Emisor',
            issuer,
            addDateT: 'Fecha incorporación del testimonio',
            addDate,
            endDateT: 'Fecha fin de vigencia',
            endDate,
            level: 'Nivel ' + level,
            iconsStars: stars,
            credentialAssigned,
            isExpanded: false,
            isHidden: false,
            isChecked: true
        };
    }

    /**
     * Function that listens when change the segment
     */
    async segmentChanged(event: any): Promise<void> {
        this.resetSelection();
        this.type = (event && event.detail) ? event.detail.value : AppConfig.CREDENTIALS;
        // await this.onSearch();
        this.activities = from(this.getActivities()).pipe(share());
    }

    /**
     * Force change of selectAll variable
     */
    forceChangeSelectAll(): void {
        if (this.optionsComponent) {
            this.activities.forEach(activities => {
                if (this.activitiesSelected && this.activitiesSelected.length) {
                    if (activities.length === this.activitiesSelected.length) {
                        let isSelectAllActivities = true;
                        for (let i = 0, length = this.activitiesSelected.length; i < length; i++) {
                            if (this.activitiesSelected[i] === null || this.activitiesSelected[i] === undefined) {
                                isSelectAllActivities = false;
                            }
                        }
                        this.optionsComponent.clickSelectAllFromParent(!isSelectAllActivities, isSelectAllActivities);
                    } else {
                        this.optionsComponent.clickSelectAllFromParent(true, false);
                    }
                } else {
                    this.optionsComponent.clickSelectAllFromParent(false, false);
                }
            });
        }
    }

    /**
     * Function for select item, change style and activate options
     * @param index - *
     * @param activity - item selected
     */
    selectActivity(index: number, activity: any): void {
        this.selection = true;
        if (this.activitiesSelected && this.activitiesSelected.length && this.activitiesSelected[index]) {
            this.activitiesSelected[index] = undefined;
            let unselectAll = true;
            this.activitiesSelected.forEach(activityId => {
                if (activityId) {
                    unselectAll = false;
                }
            });
            if (unselectAll) {
                this.resetSelection();
            }
        } else {
            this.activitiesSelected[index] = activity.activityId;
        }

        this.forceChangeSelectAll();
    }

    /**
     * Function that listening if 'selectAll' checkbox in options component, if true then select all activities
     * @param isSelectAll - *
     */
    handleSelectAll(isSelectAll: boolean): void {
        if (isSelectAll) {
            this.activities.forEach((activities) => {
                activities.map((activity, i) => {
                    if (!this.activitiesSelected[i]) {
                        this.activitiesSelected[i] = activity.activityId;
                    }
                });
            });
        } else {
            if (isSelectAll !== null) {
                this.resetSelection();
            }
        }
    }

    /**
     * Function that listening if delete or backup click in options component
     * @param  type - delete or backup
     */
    handleDeleteOrBackup(type: string, isPresentation): void {
        const deleteType = 'delete';
        let title = '';
        let message = '';
        if (type.toLowerCase() === deleteType.toLowerCase() && !isPresentation) {
            title = 'Borrar actividades';
            message = '¿Estas seguro de eliminar las actividades seleccionadas?';
        } else {
            title = 'Revocar presentacion';
            // tslint:disable-next-line: max-line-length
            message = '¿Estas seguro de que quieres revocar esta presentación? El proveedor deberá borrar las credenciales de esta presentación si solicitas la revocación.';
        }
        this.showConfirm(title, message, type);
    }

    /**
     * Show alert for confirm delete or backup of the activities selected
     * @param title - title of alert
     * @param message - message of alert
     * @param type - delete or backup
     */
    async showConfirm(title: string, message: string, type: string): Promise<void> {
        const deleteType = 'delete';
        const alert = await this.alertCtrl.create({
            header: title,
            message,
            buttons: [
                {
                    text: 'Cancelar',
                    handler: () => {
                        console.log('Disagree clicked');
                    }
                },
                {
                    text: 'Eliminar',
                    handler: () => {
                        if (type.toLowerCase() === deleteType.toLowerCase()) {
                            this.deleteActivities(this.activitiesSelected);
                        } else {
                            this.backupActivities(this.activitiesSelected);
                        }
                    }
                }
            ]
        });
        await alert.present();
    }

    resetSelection(): void {
        this.selection = false;
        this.activitiesSelected = [];
    }

    private async createActivityObject(activityId: number, title: string, subtitle: string,
                                       description: string, dateTime: any, statusType: number, removeKey: string) {
        const auxArray = ['Valid', 'AskIssuer', 'Revoked', 'DeletedBySubject'];
        return {
            activityId,
            title: (title) ? title.toUpperCase().replace(/_/g, ' ') : '',
            subtitle,
            description,
            datetime: dateTime,
            type: this.type,
            status: AppConfig.ActivityStatus[auxArray[statusType]],
            removeKey,
        };
    }

    private async getCredentialStatus(web3: any, psmHash: string, did: string) {
        const status = await this.transactionSrv.getSubjectPresentationStatus(web3, did, psmHash);

        return status;
    }

    private createStars(level: number): Array<any> {
        const iconActive = 'iconActive';
        const iconInactive = 'iconInactive';
        const isActive = 'isActive';
        const iconStar = 'icon-star';
        const iconStarOutline = 'icon-star-outline';

        const stars = [{
            [iconActive]: iconStar,
            [iconInactive]: iconStarOutline,
            [isActive]: true
        }, {
            [iconActive]: iconStar,
            [iconInactive]: iconStarOutline,
            [isActive]: true
        }, {
            [iconActive]: iconStar,
            [iconInactive]: iconStarOutline,
            [isActive]: true
        }];

        for (let z = 0; z < stars.length; z++) {
            stars[z].isActive = ((z + 1 <= level) ? true : false);
        }

        return stars;
    }

    private async getPresentationStatus(web3: any, psmHash: string, did: string) {
        const status = await this.transactionSrv.getSubjectPresentationStatus(web3, did, psmHash);

        return status;
    }

    /**
     * Function that call service for delete activities selected
     * @param ids - ids of the activities selected
     */
    async deleteActivities(ids: Array<number>): Promise<void> {
        try {
            const keysToRemove = [];
            let messageSuccess;
            const messageSuccessCred = 'Se han borrado las actividades correctamente';
            const messageSuccessPresent = 'Se han revocado las actividades correctamente';
            // this.loadingSrv.showModal();

            this.activities.forEach((activities) => {
                if (this.type === AppConfig.CREDENTIAL_TYPE) {
                    ids.map(id => {
                        const key = activities[id][AppConfig.REMOVE_KEY];
                        keysToRemove.push(this.securedStrg.removePresentation(key));
                    });

                    messageSuccess = messageSuccessCred;

                } else {
                    ids.map((id, i) => {
                            if (id && activities[i].status !== AppConfig.ActivityStatus.Revoked) {
                                keysToRemove.push(this.securedStrg.getJSON(activities[i][AppConfig.REMOVE_KEY])
                                    .then(presentation => this.revokePresentation(presentation[AppConfig.PSM_HASH])));
                            }
                        }
                    );

                    messageSuccess = messageSuccessPresent;
                }

                Promise.all(keysToRemove)
                    .then(async (res) => {
                        this.resetSelection();
                        this.activities = from(this.getActivities()).pipe(share());
                        return this.activities;
                    })
                    .then(() => {
                        this.toastCtrl.presentToast(messageSuccess);
                    });
            });

        } catch (error) {
            this.loadingSrv.hide();
            console.error('error delete activities ', error);
        }
    }

    /**
     * Function that call service for backuo activities selected
     * @param ids - ids of the activities selected
     */
    async backupActivities(ids: Array<number>): Promise<void> {
        const messageSuccess = 'Se ha realizado el backup correctamente';
        try {
            await this.activitiesService.backupActivities(ids);
            this.resetSelection();
            this.toastCtrl.presentToast(messageSuccess);
        } catch (err) {
            console.error('backupActivities ', err);
        }
    }

    private async revokePresentation(PSMHash) {
        return this.transactionSrv.revokeSubjectPresentation(this.web3, PSMHash);
    }
}
