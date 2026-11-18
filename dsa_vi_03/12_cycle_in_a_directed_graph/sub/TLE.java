

/*Complete the function below*/

class Solution {
    public static void dfs(int vertex,ArrayList<ArrayList<Integer>> adj,int path[],int bool[]){
        path[vertex]=1;
        
        for(int it:adj.get(vertex)){
            if(path[it]==0){
                path[it]=1;
                dfs(it,adj,path,bool);
            }
            else{
                bool[0]=1;
            }
        }
        path[vertex]=0;
    }
    public boolean isCyclic(ArrayList<ArrayList<Integer>> adj) {
        // code here
        int bool[]={0};
        int path[]=new int[adj.size()];
        
        for(int i=0;i<adj.size();i++){
            dfs(i,adj,path,bool);
        }
        
        if(bool[0]==1){
            return true;
        }
        return false;
    }
}