// User function Template for Java

class GFG {
    ArrayList<Integer> find(int arr[], int x) {
        // code here
        ArrayList<Integer> ans=new ArrayList<>();
        int last=-1,first=-1;
        int n=arr.length;
        if(n<=1) return ans;
        int i=0,j=n-1;
        while(i<j){
            int m=(i+j)/2;
            if(arr[m]<x){
                i=m+1;
            } else if(arr[m]>x) {
                j=m-1;
            } else {
                j=m;
            }
        }
        if(arr[i]==x) first=i;
        i=0;
        j=n-1;
        while(i<j){
            int m=(i+j)/2;
            if(arr[m]<x){
                i=m+1;
            } else if(arr[m]>x) {
                j=m-1;
            } else {
                i=m;
                if(j-i==1) break;
            }
        }
        if(j<0) last=-1;
        else if(arr[j]==x) last=j;
        else if(arr[i]==x && i>=0) last=i;
        ans.add(first);
        ans.add(last);
        return ans;
    }
}