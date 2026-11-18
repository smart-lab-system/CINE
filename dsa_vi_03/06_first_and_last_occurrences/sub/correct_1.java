// User function Template for Java

class GFG {
    ArrayList<Integer> find(int arr[], int x) {
        // code here
        int n= arr.length;
        boolean flag = false;
        ArrayList<Integer> ans= new ArrayList<>();
        // Element is exist or not
        for(int i=0;i<n;i++){
            if(arr[i]==x){
                flag = true;
                break;
            }
            else{
                flag = false;
            }
        }
        
        if(flag){
            for(int i=0;i<n;i++){
            if(arr[i]==x){
                ans.add(i);
                break;
            }
        }
        
         for(int i=n-1; i>=0;i--){
            if(arr[i]==x){
                ans.add(i);
                break;
            }
        }
        }
        else{
            ans.add(-1);
            ans.add(-1);
        }
        
        
        
        return ans;
    }
}