import {Outlet, RouteObject} from "react-router-dom";
import {AppLayout} from "src/layouts";
import {ErrorPage} from "./ErrorPage/ErrorPage";
import {NewPage, ProfilePage, StartPage} from "src/pages";

const AppWrapper = () => {
    return <AppLayout>
        <Outlet/>
    </AppLayout>
}
export const routes: RouteObject[] = [
    {
        element: <AppWrapper/>,
        errorElement: <ErrorPage/>,
        path: '/',
        children: [
            {
                index: true,
                element: <StartPage/>
            },
            {
                path: '/profile',
                element: <ProfilePage/>
            },
            {
                path: '/new',
                element: <NewPage/>
            }
        ]
    }
]